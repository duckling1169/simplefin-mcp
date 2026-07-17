# Architecture

## System boundary

Inside: a Next.js app rendered server-side, running locally. Outside: SimpleFin's Bridge API (the
account/balance data source) and the browser rendering the resulting HTML. The browser never talks
to SimpleFin, and never talks to any API route of this app either -- there is no API route. Only
server-side rendering code talks to SimpleFin.

## Components

| Component | Responsibility | Depends on |
|---|---|---|
| `app/page.tsx` (Server Component) | Reads `SIMPLEFIN_ACCESS_URL` server-side, fetches SimpleFin's `/accounts` endpoint at request time, renders accounts grouped by institution with plain CSS, handles missing-env and upstream-failure error states | SimpleFin Bridge API, `SIMPLEFIN_ACCESS_URL` env var |

## Data and control flow

Browser requests the page → Next.js renders `app/page.tsx` server-side → server-side code calls
SimpleFin's Bridge API directly using `SIMPLEFIN_ACCESS_URL` (credential embedded in the URL) →
server renders the resulting HTML → browser receives only rendered markup, never the credential or
SimpleFin's raw response.

## Contracts and invariants

- `SIMPLEFIN_ACCESS_URL` is read only in server-side code (Server Components / server-only modules),
  never in a `NEXT_PUBLIC_*` var, never rendered into HTML, never logged.
- There is no client-side API route and no client-side fetch of SimpleFin data in milestone 1 -- if
  a later milestone needs one (e.g. an MCP server or a second client), that is a deliberate,
  separately-grilled architecture change, not an incidental addition.
- Orchestrator tasks and their verification run against SimpleFin's public demo bridge
  (`https://demo:demo@beta-bridge.simplefin.org/simplefin`), never against a real linked account.
  See `docs/product/PURPOSE.md`.
- The page blocks on the SimpleFin fetch and renders once complete; no `loading.tsx` or
  Suspense-based streaming in milestone 1.
- Plain CSS only in milestone 1 -- no styling framework. A later, separately-grilled milestone
  covers UX/UI research and implementation.
- The orchestrator commits to the `dev` branch only; `main` is `policy.json`'s protected branch and
  the runner refuses to commit there. No remote is configured; nothing is pushed in milestone 1.

## Decisions

- `2026-07-17` — chosen Next.js + pnpm workspace (matching `js/ember-finance`) over a bare static
  page + separate backend, so the SimpleFin credential can stay server-side without standing up a
  second service.
- `2026-07-17` — chosen a Server Component that fetches SimpleFin directly over a client-side API
  route + client fetch, because milestone 1 has exactly one consumer of the data (this page) --
  fewer moving parts, one less place a credential could theoretically leak through. Revisit if a
  later milestone (MCP server, second client) needs the same data independently of this page.

