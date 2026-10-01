import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";

// The deployment owner unlocks /setup with OWNER_PASSWORD. The session cookie
// holds a hash of the password, so changing the password signs everyone out.
// Fails closed: with OWNER_PASSWORD unset, nobody is the owner.

const COOKIE = "owner";
const digest = (s: string) =>
  createHash("sha256").update(`owner:${s}`).digest();

function expected(): Buffer | null {
  const password = process.env.OWNER_PASSWORD;
  return password ? digest(password) : null;
}

export function passwordMatches(candidate: string): boolean {
  const want = expected();
  return !!want && timingSafeEqual(digest(candidate), want);
}

export async function isOwner(): Promise<boolean> {
  const want = expected();
  const got = (await cookies()).get(COOKIE)?.value;
  if (!want || !got) return false;
  const gotBuf = Buffer.from(got, "base64url");
  return gotBuf.length === want.length && timingSafeEqual(gotBuf, want);
}

export async function signIn() {
  (await cookies()).set(COOKIE, expected()!.toString("base64url"), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
