import { timingSafeEqual } from "node:crypto";

// Server-only by construction: reads MCP_BEARER_KEY (a credential), so this module must
// only ever be imported from server-side route handlers, never given a "use client"
// directive or imported into one.

/** Constant-time string comparison -- avoids leaking key length/prefix via timing. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Still perform a comparison of matching length so a length mismatch doesn't
    // short-circuit faster than a full comparison would.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/** Pulls the bearer key from the Authorization header, or falls back to ?key=. */
function extractBearerKey(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const fromHeader = header.slice(7).trim();
    if (fromHeader) return fromHeader;
  }
  const fromQuery = new URL(req.url).searchParams.get("key")?.trim();
  return fromQuery || null;
}

/**
 * Checks the request's bearer key against MCP_BEARER_KEY using a constant-time
 * comparison. If the env var is unset, every request is rejected (fail closed) --
 * there is no "auth disabled" mode.
 */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.MCP_BEARER_KEY;
  if (!expected) return false;

  const provided = extractBearerKey(req);
  if (!provided) return false;

  return timingSafeEqualString(provided, expected);
}
