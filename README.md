# simplefin-mcp

An MCP server for [SimpleFin](https://www.simplefin.org/) account balances, deployed at
https://simplefin-mcp.vercel.app.

## Use

1. Create a setup token in [SimpleFin Bridge](https://beta-bridge.simplefin.org/).
2. Paste it at https://simplefin-mcp.vercel.app. The page claims it and shows a connector URL once.
3. Add that URL as a custom connector (MCP server) in Claude, ChatGPT, or any MCP client.

Tools (read-only): `list_accounts`, `get_transactions`, `spending_summary`, `get_holdings`,
`get_connection_status`. Data is cached per connection for 4 hours (`lib/data.ts`) because
SimpleFin Bridge allows ~24 requests/day and recommends at most 45 days per request.

## How it works

- `app/actions.ts` claims the setup token and creates a connection (`lib/connections.ts`).
- Each connection is a row in Supabase's `connections` table: the SHA-256 of a random connection
  key, plus the SimpleFin access URL AES-256-GCM-encrypted under a key derived from it. The
  connection key exists only in the user's connector URL.
- `app/mcp/route.ts` looks up the key (`Authorization: Bearer` or `?key=`), decrypts the access URL,
  and serves the tool.

## Develop

```bash
CI=true pnpm install --frozen-lockfile
pnpm verify   # format, typecheck, test
```

Copy `.env.example` to `.env.local` for local runs. Schema lives in `supabase/migrations/`.
