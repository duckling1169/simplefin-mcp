import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

// Server-only. A "connection" is one claimed SimpleFin setup token. The user gets back a random
// connection key (embedded in their connector URL). We store only:
//   - SHA-256(key), for lookup
//   - the SimpleFin access URL, AES-256-GCM encrypted with a key derived from the connection key
// so a database leak alone exposes no access URLs, and nothing on the server can decrypt one
// without the user presenting their key. Losing the URL means claiming a new setup token.

const CLAIM_HOST_SUFFIX = ".simplefin.org";

export class SetupTokenError extends Error {}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase is not configured on the server.");
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return { rest: `${url.replace(/\/$/, "")}/rest/v1`, headers };
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
const aesKey = (key: string) =>
  Buffer.from(hkdfSync("sha256", key, "simplefin-mcp", "access-url", 32));

/** AES-256-GCM under a key derived from the connection key. */
export function seal(plaintext: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(key), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function unseal(ciphertext: string, key: string): string {
  const [iv, tag, data] = ciphertext.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", aesKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Decodes a setup token to its claim URL, refusing anything that isn't an https SimpleFin host. */
export function claimUrlFromSetupToken(setupToken: string): URL {
  let url: URL;
  try {
    url = new URL(Buffer.from(setupToken.trim(), "base64").toString("utf8").trim());
  } catch {
    throw new SetupTokenError("That doesn't look like a SimpleFin setup token.");
  }
  if (url.protocol !== "https:" || !`.${url.hostname}`.endsWith(CLAIM_HOST_SUFFIX)) {
    throw new SetupTokenError("That doesn't look like a SimpleFin setup token.");
  }
  return url;
}

/** Claims the setup token (one-time), stores the encrypted access URL, returns the new key. */
export async function createConnection(setupToken: string): Promise<string> {
  const claimUrl = claimUrlFromSetupToken(setupToken);
  const res = await fetch(claimUrl, { method: "POST", headers: { "Content-Length": "0" } });
  if (!res.ok) {
    throw new SetupTokenError(
      res.status === 403
        ? "This setup token was already claimed. Generate a new one in SimpleFin Bridge."
        : `SimpleFin rejected the token (HTTP ${res.status}).`,
    );
  }
  const accessUrl = (await res.text()).trim();
  if (!accessUrl.startsWith("https://")) throw new SetupTokenError("SimpleFin returned an unexpected response.");

  const key = randomBytes(32).toString("base64url");
  const { rest, headers } = supabaseConfig();
  const insert = await fetch(`${rest}/connections`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ key_hash: hashKey(key), access_url_ciphertext: seal(accessUrl, key) }),
  });
  if (!insert.ok) throw new Error(`Failed to save connection (HTTP ${insert.status}).`);
  return key;
}

export type ConnectionHandle = { key: string; keyHash: string; accessUrl: string };

/** Resolves a connection key to its decrypted access URL, or null if the key is unknown. */
export async function loadConnection(key: string): Promise<ConnectionHandle | null> {
  const { rest, headers } = supabaseConfig();
  const keyHash = hashKey(key);
  const res = await fetch(`${rest}/connections?key_hash=eq.${keyHash}&select=access_url_ciphertext`, { headers });
  if (!res.ok) throw new Error(`Failed to look up connection (HTTP ${res.status}).`);
  const rows = (await res.json()) as { access_url_ciphertext: string }[];
  if (rows.length === 0) return null;
  void fetch(`${rest}/connections?key_hash=eq.${keyHash}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => {});
  return { key, keyHash, accessUrl: unseal(rows[0].access_url_ciphertext, key) };
}

/** Cached, encrypted per-connection payload (see snapshots table). */
export async function readSnapshot(conn: ConnectionHandle): Promise<{ json: string; fetchedAt: number } | null> {
  const { rest, headers } = supabaseConfig();
  const res = await fetch(`${rest}/snapshots?key_hash=eq.${conn.keyHash}&select=ciphertext,fetched_at`, { headers });
  if (!res.ok) return null;
  const rows = (await res.json()) as { ciphertext: string; fetched_at: string }[];
  if (rows.length === 0) return null;
  try {
    return { json: unseal(rows[0].ciphertext, conn.key), fetchedAt: Date.parse(rows[0].fetched_at) };
  } catch {
    return null;
  }
}

export async function writeSnapshot(conn: ConnectionHandle, json: string): Promise<void> {
  const { rest, headers } = supabaseConfig();
  await fetch(`${rest}/snapshots?on_conflict=key_hash`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key_hash: conn.keyHash, ciphertext: seal(json, conn.key), fetched_at: new Date().toISOString() }),
  }).catch(() => {});
}
