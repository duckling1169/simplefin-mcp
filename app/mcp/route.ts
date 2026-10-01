import { createMcpHandler } from "mcp-handler";

import { isAuthorized } from "../../lib/mcp-auth";
import { getBalances } from "../../lib/simplefin";

/**
 * MCP Streamable HTTP endpoint exposing a single tool, get_balances, backed by the
 * same shared SimpleFin module the dashboard page uses (lib/simplefin.ts).
 *
 * Auth: a static bearer key (MCP_BEARER_KEY), checked before the handler ever runs --
 * see lib/mcp-auth.ts. A missing/wrong key never reaches get_balances, so no SimpleFin
 * call is attempted for an unauthenticated request.
 *
 * The rejection response below is a 401 with a JSON body and a `WWW-Authenticate:
 * Bearer` header (not a bare, bodyless 401) -- matching js/ember-finance's
 * src/app/api/mcp/route.ts, which found that some MCP clients treat a bare 401 as an
 * invitation to attempt OAuth auto-registration. Responding with a normal Bearer
 * challenge instead avoids that.
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

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "Missing or invalid bearer key. Pass it as an Authorization: Bearer header or a ?key= query param." }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="simplefin-mcp-mcp"',
      },
    },
  );
}

async function handleAuthed(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return unauthorized();
  }
  return handler(req);
}

export { handleAuthed as GET, handleAuthed as POST, handleAuthed as DELETE };
