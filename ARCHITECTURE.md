# Architecture

## System boundary

Inside: a Next.js app (server + client) running locally. Outside: SimpleFin's Bridge API (the
account/balance data source) and the browser rendering the dashboard. Only the Next.js server talks
to SimpleFin; the browser only ever talks to this app's own API route.

## Components

| Component | Responsibility | Depends on |
|---|---|---|
| `app/api/accounts/route.ts` (or equivalent route handler) | Server-side: reads `SIMPLEFIN_ACCESS_URL`, calls SimpleFin's `/accounts` endpoint, returns a balances-only JSON shape to the client | SimpleFin Bridge API, `SIMPLEFIN_ACCESS_URL` env var |
| `app/page.tsx` (dashboard) | Client: fetches from the app's own API route, renders accounts grouped by institution with loading/error states | The app's own `/api/accounts` route only |

## Data and control flow

Browser → this app's `/api/accounts` route (same-origin, no credential) → SimpleFin Bridge API
(server-side only, credential embedded in `SIMPLEFIN_ACCESS_URL`) → route strips anything
credential-bearing → JSON balances back to the browser.

## Contracts and invariants

- `SIMPLEFIN_ACCESS_URL` is read only in server-side code (route handlers / server components),
  never in a `NEXT_PUBLIC_*` var, never returned in an API response body, never logged.
- The client-facing API response contains only display data (institution name, account name,
  balance, currency, as-of date) — never the access URL, never raw SimpleFin auth headers.
- Orchestrator tasks and their verification run against SimpleFin's public demo bridge, never
  against a real linked account. See `docs/product/PURPOSE.md`.

## Decisions

- `2026-07-17` — chosen Next.js + pnpm workspace (matching `js/ember-finance`) over a bare static
  page + separate backend, so the SimpleFin credential can stay server-side without standing up a
  second service — because the workspace, tooling, and deploy story (Vercel, later an MCP server)
  are already proven for that stack in this repo tree.

