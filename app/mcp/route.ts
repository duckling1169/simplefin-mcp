import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { getBalances } from "../../lib/simplefin";
import { verifyToken } from "../../lib/verify-token";

/**
 * MCP Streamable HTTP endpoint exposing a single tool, get_balances, backed by the
 * same shared SimpleFin module the dashboard page uses (lib/simplefin.ts).
 *
 * Auth: standard MCP OAuth. withMcpAuth answers unauthenticated requests with a 401 whose
 * WWW-Authenticate points at /.well-known/oauth-protected-resource, which names Supabase's
 * OAuth 2.1 server -- so clients like claude.ai run the sign-in flow. Tokens are checked in
 * lib/verify-token.ts (Supabase JWT + MCP_ALLOWED_EMAILS, or the static MCP_BEARER_KEY).
 * A rejected request never reaches get_balances, so no SimpleFin call is made.
 */

export const runtime = "nodejs";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_balances",
      {
        title: "Get balances",
        description:
          "Get SimpleFin account balances grouped by institution -- the same data the dashboard page shows.",
        inputSchema: {},
      },
      async () => {
        try {
          const groups = await getBalances();
          return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch balances.";
          return { content: [{ type: "text", text: message }], isError: true };
        }
      },
    );
  },
  { serverInfo: { name: "simplefin-mcp", version: "0.0.0" } },
  { basePath: "", maxDuration: 60, disableSse: true },
);

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

/** Lets ?key=<MCP_BEARER_KEY> stand in for the Authorization header (clients that can't set one). */
function handleAuthed(req: Request): Promise<Response> {
  const key = new URL(req.url).searchParams.get("key");
  if (key && !req.headers.get("authorization")) {
    const headers = new Headers(req.headers);
    headers.set("authorization", `Bearer ${key}`);
    req = new Request(req, { headers });
  }
  return authed(req);
}

export { handleAuthed as GET, handleAuthed as POST, handleAuthed as DELETE };
