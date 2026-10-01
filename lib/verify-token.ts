import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { timingSafeEqualString } from "./mcp-auth";
import { supabaseUrl } from "./supabase-env";

// Server-only: reads MCP_BEARER_KEY. Two accepted credentials:
//   1. A Supabase OAuth 2.1 access token (what claude.ai and other MCP clients obtain via the
//      sign-in flow), verified against the project's JWKS and gated by MCP_ALLOWED_EMAILS --
//      anyone can create a Supabase account, so a valid JWT alone is NOT enough to read balances.
//   2. The static MCP_BEARER_KEY, kept for scripts and clients that can't do OAuth.

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(issuer: string) {
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return jwks;
}

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.MCP_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** mcp-handler's withMcpAuth verifyToken callback. Fails closed. */
export async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const staticKey = process.env.MCP_BEARER_KEY;
  if (staticKey && timingSafeEqualString(bearerToken, staticKey)) {
    return { token: bearerToken, clientId: "static-key", scopes: [] };
  }

  const allowed = allowedEmails();
  if (allowed.size === 0) return undefined;

  try {
    const issuer = `${supabaseUrl()}/auth/v1`;
    const { payload } = await jwtVerify(bearerToken, getJwks(issuer), {
      issuer,
      audience: "authenticated",
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email || !allowed.has(email)) return undefined;
    const clientId =
      typeof payload.client_id === "string" ? payload.client_id : String(payload.sub ?? "");
    return { token: bearerToken, clientId, scopes: [], extra: { email } };
  } catch {
    // Never log the token or raw error.
    return undefined;
  }
}
