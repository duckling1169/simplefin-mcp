import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { db } from "@/lib/db";
import { fetchAccountSet } from "@/lib/simplefin";

// Server-only. A "connection" is one claimed SimpleFin setup token. The user gets back a random
// connection key (embedded in their connector URL). We store only:
//   - SHA-256(key), for lookup
//   - the SimpleFin access URL, AES-256-GCM encrypted with a key derived from the connection key
// so a database leak alone exposes no access URLs, and nothing on the server can decrypt one
// without the user presenting their key. Losing the URL means claiming a new setup token.

const CLAIM_HOST_SUFFIX = ".simplefin.org";

export class SetupTokenError extends Error {}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
const aesKey = (key: string) =>
  Buffer.from(hkdfSync("sha256", key, "simplefin-mcp", "access-url", 32));

/** AES-256-GCM under a key derived from the connection key. */
export function seal(plaintext: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(key), iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function unseal(ciphertext: string, key: string): string {
  const [iv, tag, data] = ciphertext
    .split(".")
    .map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("Malformed ciphertext.");
  const decipher = createDecipheriv("aes-256-gcm", aesKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** Decodes a setup token to its claim URL, refusing anything that isn't an https SimpleFin host. */
export function claimUrlFromSetupToken(setupToken: string): URL {
  let url: URL;
  try {
    url = new URL(
      Buffer.from(setupToken.trim(), "base64").toString("utf8").trim(),
    );
  } catch {
    throw new SetupTokenError(
      "That doesn't look like a SimpleFin setup token.",
    );
  }
  if (
    url.protocol !== "https:" ||
    !`.${url.hostname}`.endsWith(CLAIM_HOST_SUFFIX)
  ) {
    throw new SetupTokenError(
      "That doesn't look like a SimpleFin setup token.",
    );
  }
  return url;
}

/** Claims the setup token (one-time), stores the encrypted access URL, returns the new key. */
export async function createConnection(setupToken: string): Promise<string> {
  const claimUrl = claimUrlFromSetupToken(setupToken);
  const res = await fetch(claimUrl, {
    method: "POST",
    headers: { "Content-Length": "0" },
  });
  if (!res.ok) {
    throw new SetupTokenError(
      res.status === 403
        ? "This setup token was already claimed. Generate a new one in SimpleFin Bridge."
        : `SimpleFin rejected the token (HTTP ${res.status}).`,
    );
  }
  const accessUrl = (await res.text()).trim();
  if (!accessUrl.startsWith("https://"))
    throw new SetupTokenError("SimpleFin returned an unexpected response.");

  // One balances-only request names the connection for the owner's list.
  const label = await fetchAccountSet(accessUrl, { balancesOnly: true })
    .then((set) => set.connections.map((c) => c.name).join(", ") || null)
    .catch(() => null);

  const key = randomBytes(32).toString("base64url");
  const q = await db();
  await q`insert into connections (key_hash, access_url_ciphertext, label)
    values (${hashKey(key)}, ${seal(accessUrl, key)}, ${label})`;
  return key;
}

export type ConnectionHandle = {
  key: string;
  keyHash: string;
  accessUrl: string;
};

/** Resolves a connection key to its decrypted access URL, or null if the key is unknown. */
export async function loadConnection(
  key: string,
): Promise<ConnectionHandle | null> {
  const q = await db();
  const keyHash = hashKey(key);
  const rows = (await q`update connections set last_used_at = now()
    where key_hash = ${keyHash} returning access_url_ciphertext`) as {
    access_url_ciphertext: string;
  }[];
  const row = rows[0];
  if (!row) return null;
  return {
    key,
    keyHash,
    accessUrl: unseal(row.access_url_ciphertext, key),
  };
}

/** Cached, encrypted per-connection payload (see snapshots table). */
export async function readSnapshot(
  conn: ConnectionHandle,
): Promise<{ json: string; fetchedAt: number } | null> {
  try {
    const q = await db();
    const rows = (await q`select ciphertext, fetched_at from snapshots
      where key_hash = ${conn.keyHash}`) as {
      ciphertext: string;
      fetched_at: Date;
    }[];
    const row = rows[0];
    if (!row) return null;
    return {
      json: unseal(row.ciphertext, conn.key),
      fetchedAt: new Date(row.fetched_at).getTime(),
    };
  } catch {
    return null;
  }
}

export async function writeSnapshot(
  conn: ConnectionHandle,
  json: string,
): Promise<void> {
  try {
    const q = await db();
    await q`insert into snapshots (key_hash, ciphertext, fetched_at)
      values (${conn.keyHash}, ${seal(json, conn.key)}, now())
      on conflict (key_hash) do update
      set ciphertext = excluded.ciphertext, fetched_at = excluded.fetched_at`;
  } catch {
    // The cache is best-effort; a failed write only costs a refetch later.
  }
}

export type ConnectionSummary = {
  keyHash: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function listConnections(): Promise<ConnectionSummary[]> {
  const q = await db();
  const rows = (await q`select key_hash, label, created_at, last_used_at
    from connections order by created_at`) as {
    key_hash: string;
    label: string | null;
    created_at: Date;
    last_used_at: Date | null;
  }[];
  return rows.map((r) => ({
    keyHash: r.key_hash,
    label: r.label,
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
  }));
}

/** Deletes a connection; its cached snapshot goes with it (on delete cascade). */
export async function revokeConnection(keyHash: string): Promise<void> {
  const q = await db();
  await q`delete from connections where key_hash = ${keyHash}`;
}
