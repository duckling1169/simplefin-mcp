import { AsyncLocalStorage } from "node:async_hooks";

import { createMcpHandler } from "mcp-handler";

import { accessUrlForKey } from "../../lib/connections";

import { extractBearerKey, isAuthorized } from "../../lib/mcp-auth";
import { getBalances } from "../../lib/simplefin";

/**
 * MCP Streamable HTTP endpoint exposing a single tool, get_balances, backed by the
 * same shared SimpleFin module the dashboard page uses (lib/simplefin.ts).
 *
 * Auth: either a per-connection key minted by /setup (see lib/connections.ts) or the
 * operator's static MCP_BEARER_KEY (see lib/mcp-auth.ts), checked before the handler runs.
 * A missing/wrong key never reaches get_balances, so no SimpleFin call is attempted.
 *
 * The rejection response below is a 401 with a JSON body and a `WWW-Authenticate:
 * Bearer` header (not a bare, bodyless 401) -- matching js/ember-finance's
 * src/app/api/mcp/route.ts, which found that some MCP clients treat a bare 401 as an
 * invitation to attempt OAuth auto-registration. Responding with a normal Bearer
 * challenge instead avoids that.
 */

export const runtime = "nodejs";

// The resolved SimpleFin access URL for the current request (per-connection, or the
// operator's SIMPLEFIN_ACCESS_URL when the static MCP_BEARER_KEY is used).
const requestAccessUrl = new AsyncLocalStorage<string | undefined>();

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
          const groups = await getBalances(requestAccessUrl.getStore());
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
  if (isAuthorized(req)) {
    return requestAccessUrl.run(undefined, () => handler(req));
  }
  const key = extractBearerKey(req);
  const accessUrl = key ? await accessUrlForKey(key).catch(() => null) : null;
  if (!accessUrl) return unauthorized();
  return requestAccessUrl.run(accessUrl, () => handler(req));
}

export { handleAuthed as GET, handleAuthed as POST, handleAuthed as DELETE };
