import { AsyncLocalStorage } from "node:async_hooks";

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { type ConnectionHandle, loadConnection } from "../../lib/connections";
import { getSnapshot, getTransactionsInRange } from "../../lib/data";
import { DAY } from "../../lib/simplefin";
import {
  connectionStatus,
  filterTransactions,
  formatTransaction,
  listAccounts,
  listHoldings,
  summarize,
} from "../../lib/tools";

// MCP Streamable HTTP endpoint. Auth is the connection key minted by the setup page, sent as
// `Authorization: Bearer <key>` or `?key=<key>`. An unknown key never reaches a tool.

export const runtime = "nodejs";

const requestConnection = new AsyncLocalStorage<ConnectionHandle>();

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

async function run(
  fn: (conn: ConnectionHandle) => Promise<unknown>,
): Promise<ToolResult> {
  try {
    const result = await fn(requestConnection.getStore()!);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const toUnix = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000);

function range(start?: string, end?: string, defaultDays = 30) {
  const endUnix = end ? toUnix(end) + DAY : Math.floor(Date.now() / 1000) + DAY;
  const startUnix = start ? toUnix(start) : endUnix - (defaultDays + 1) * DAY;
  if (startUnix >= endUnix)
    throw new Error("start_date must be on or before end_date.");
  return { startUnix, endUnix };
}

const CACHE_NOTE =
  "Data is cached for up to 4 hours (SimpleFin allows ~24 refreshes/day and banks update about daily).";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_accounts",
      {
        title: "List accounts",
        description: `All accounts grouped by institution with balance, available balance and IDs. ${CACHE_NOTE}`,
        inputSchema: {
          refresh: z
            .boolean()
            .optional()
            .describe(
              "Bypass the cache. Uses SimpleFin's daily quota; avoid unless asked.",
            ),
        },
        annotations: { readOnlyHint: true },
      },
      ({ refresh }) =>
        run(async (conn) => {
          const snap = await getSnapshot(conn, { refresh });
          const total = snap.accounts.reduce((n, a) => n + a.balance, 0);
          return {
            dataFetchedAt: new Date(snap.fetchedAt).toISOString(),
            netTotal: Math.round(total * 100) / 100,
            institutions: listAccounts(snap),
            errors: snap.errors.map((e) => e.message),
          };
        }),
    );

    server.registerTool(
      "get_transactions",
      {
        title: "Get transactions",
        description:
          "Transactions, newest first. Negative amounts are money out. Defaults to the last 30 days. " +
          "About the last 90 days are cached; older ranges cost extra SimpleFin requests.",
        inputSchema: {
          start_date: isoDate.optional().describe("Inclusive, YYYY-MM-DD"),
          end_date: isoDate.optional().describe("Inclusive, YYYY-MM-DD"),
          account_ids: z
            .array(z.string())
            .optional()
            .describe("From list_accounts"),
          query: z
            .string()
            .optional()
            .describe("Case-insensitive match on description, payee or memo"),
          min_amount: z.number().optional(),
          max_amount: z.number().optional(),
          include_pending: z.boolean().optional().describe("Default true"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .describe("Default 100"),
        },
        annotations: { readOnlyHint: true },
      },
      (args) =>
        run(async (conn) => {
          const { startUnix, endUnix } = range(args.start_date, args.end_date);
          const snap = await getSnapshot(conn);
          const { rows, note } = await getTransactionsInRange(
            conn,
            snap,
            startUnix,
            endUnix,
            args.account_ids,
          );
          const matched = filterTransactions(rows, {
            query: args.query,
            includePending: args.include_pending,
            accountIds: args.account_ids,
            minAmount: args.min_amount,
            maxAmount: args.max_amount,
          });
          const limit = args.limit ?? 100;
          return {
            count: matched.length,
            returned: Math.min(limit, matched.length),
            transactions: matched.slice(0, limit).map(formatTransaction),
            ...(note ? { note } : {}),
          };
        }),
    );

    server.registerTool(
      "spending_summary",
      {
        title: "Spending summary",
        description:
          "Totals of money out/in over a period, grouped by payee, category (merchant category code, often missing), " +
          "account, or month. Excludes pending. Defaults to the last 30 days.",
        inputSchema: {
          start_date: isoDate.optional(),
          end_date: isoDate.optional(),
          group_by: z
            .enum(["payee", "category", "account", "month"])
            .optional()
            .describe("Default payee"),
          account_ids: z.array(z.string()).optional(),
          top: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .describe("Groups to return, default 25"),
        },
        annotations: { readOnlyHint: true },
      },
      (args) =>
        run(async (conn) => {
          const { startUnix, endUnix } = range(args.start_date, args.end_date);
          const snap = await getSnapshot(conn);
          const { rows, note } = await getTransactionsInRange(
            conn,
            snap,
            startUnix,
            endUnix,
            args.account_ids,
          );
          const posted = filterTransactions(rows, {
            includePending: false,
            accountIds: args.account_ids,
          });
          return {
            ...summarize(posted, args.group_by ?? "payee", args.top),
            ...(note ? { historyNote: note } : {}),
          };
        }),
    );

    server.registerTool(
      "get_holdings",
      {
        title: "Get holdings",
        description:
          "Investment positions (symbol, shares, market value, cost basis) for accounts that report them.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () =>
        run(async (conn) => {
          const snap = await getSnapshot(conn);
          const accounts = listHoldings(snap);
          return accounts.length
            ? accounts
            : { accounts: [], note: "No connected account reports holdings." };
        }),
    );

    server.registerTool(
      "get_connection_status",
      {
        title: "Connection status",
        description:
          "Linked institutions and any errors SimpleFin reports (e.g. a bank needing re-authentication).",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () =>
        run(async (conn) => {
          const snap = await getSnapshot(conn);
          return connectionStatus(snap, snap.fetchedAt);
        }),
    );
  },
  { serverInfo: { name: "simplefin-mcp", version: "0.1.0" } },
  { basePath: "", maxDuration: 60, disableSse: true },
);

function extractKey(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ") && header.slice(7).trim())
    return header.slice(7).trim();
  return new URL(req.url).searchParams.get("key")?.trim() || null;
}

// A JSON body plus a plain Bearer challenge (no resource_metadata), so clients don't
// mistake this for an invitation to attempt OAuth.
function unauthorized(): Response {
  return Response.json(
    {
      error:
        "Missing or invalid connection key. Get a connector URL from the setup page.",
    },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="simplefin-mcp"' },
    },
  );
}

async function handle(req: Request): Promise<Response> {
  const key = extractKey(req);
  const conn = key ? await loadConnection(key).catch(() => null) : null;
  if (!conn) return unauthorized();
  return requestConnection.run(conn, () => handler(req));
}

export { handle as GET, handle as POST, handle as DELETE };
