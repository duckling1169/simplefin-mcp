import { AsyncLocalStorage } from "node:async_hooks";

import { createMcpHandler } from "mcp-handler";

import { accessUrlForKey } from "../../lib/connections";
import { getBalances } from "../../lib/simplefin";

// MCP Streamable HTTP endpoint. Auth is the connection key minted by the setup page, sent as
// `Authorization: Bearer <key>` or `?key=<key>`. An unknown key never reaches a tool.

export const runtime = "nodejs";

const requestAccessUrl = new AsyncLocalStorage<string>();

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_balances",
      {
        title: "Get balances",
        description: "Get SimpleFin account balances grouped by institution.",
        inputSchema: {},
      },
      async () => {
        try {
          const groups = await getBalances(requestAccessUrl.getStore()!);
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

function extractKey(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ") && header.slice(7).trim()) return header.slice(7).trim();
  return new URL(req.url).searchParams.get("key")?.trim() || null;
}

// A JSON body plus a plain Bearer challenge (no resource_metadata), so clients don't
// mistake this for an invitation to attempt OAuth.
function unauthorized(): Response {
  return Response.json(
    { error: "Missing or invalid connection key. Get a connector URL from the setup page." },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="simplefin-mcp"' } },
  );
}

async function handle(req: Request): Promise<Response> {
  const key = extractKey(req);
  const accessUrl = key ? await accessUrlForKey(key).catch(() => null) : null;
  if (!accessUrl) return unauthorized();
  return requestAccessUrl.run(accessUrl, () => handler(req));
}

export { handle as GET, handle as POST, handle as DELETE };
