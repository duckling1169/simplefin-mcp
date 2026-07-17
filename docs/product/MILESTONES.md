# Milestones

This document records human-readable product outcomes and sequencing. The currently approved executable milestone lives in `.orchestrator/milestone.json`; do not duplicate task state here.

## Milestone 1 — Local balances dashboard

**Status:** proposed

**User-visible result:** Running the app locally (`pnpm run dev`) and opening the page shows every
account SimpleFin returns for the configured access URL, grouped by institution, with each
account's current balance and currency. No login screen, no other pages.

**Included:**

- Next.js (App Router, TypeScript) app scaffolded inside this repo, joined to the `js/` pnpm
  workspace, with working lint/typecheck/test/build scripts (vitest for tests).
- A Server Component that reads `SIMPLEFIN_ACCESS_URL` from a server-side-only environment variable
  and fetches SimpleFin's `/accounts` endpoint directly at request time -- no client-side API route,
  no client-side fetch.
- A single dashboard page rendering accounts grouped by institution/org with balance, currency, and
  as-of date, with clear error states (missing env var, SimpleFin auth failure, network failure).
  The page blocks on the fetch and renders once complete -- no streaming loading state.
- Plain CSS only -- no styling framework.
- Tests (unit + verifying the credential never reaches rendered output) run against SimpleFin's
  public demo bridge, not real credentials.

**Excluded:**

- Any client-side API route or client-side fetch of SimpleFin data.
- Any styling framework -- a later, separately-grilled milestone covers UX/UI research.
- `loading.tsx` / Suspense-based streaming loading states.
- Transaction history, budgeting, categorization, multi-account editing.
- Any deployment target (Vercel, etc.) — local dev only.
- Any MCP server — deferred to milestone 2 alongside deployment.
- Multi-user auth — single operator, local machine only.
- Pushing commits anywhere — orchestrator commits land on the local `dev` branch only.

**Acceptance evidence:**

- `./scripts/verify-task.sh` passes (lint, typecheck, tests, build).
- Manual check: with `SIMPLEFIN_ACCESS_URL` pointed at the SimpleFin demo bridge, `pnpm run dev`
  and loading the page shows the demo accounts grouped by institution.
- Manual check: browser devtools network tab, while loading the page, shows no request containing
  the access URL or its embedded credential.

**Decision triggers:**

- Whether balances should refresh automatically or only on page load (default: page load only,
  revisit if it's annoying in practice).

## Later milestones

These have been grilled (2026-07-17) to a shared understanding of scope and key decisions, but are
**not yet approved** and have no `.orchestrator/milestone.json` or tasks -- only one milestone slot
is active at a time, and per the orchestrator's own rule, a later milestone's executable contract
isn't drafted until the previous one is actually complete. Treat the bullets below as durable
product decisions to carry into that future drafting session, not as authorization to start work.

### Milestone 2 — Vercel deploy + MCP (balances-only)

**Sequencing:** after milestone 1. Runs before the UX/UI milestone.

**Scope:**

- Deploy to Vercel via a GitHub-connected repo (auto-deploy on push to `main`), matching
  `ember`/`ember-finance`'s `dev` → `main` workflow. A `duckling1169`-owned GitHub remote is
  created when this milestone actually starts -- not before.
- Browser UI protected by Vercel Deployment Protection (password).
- The MCP route uses two-layer auth: Vercel's Protection Bypass secret as an outer platform-level
  layer (so an MCP client can reach the route at all), plus an app-level static bearer-token check
  (`crypto.timingSafeEqual`, matching `js/ember-finance`'s simpler pattern) as the real
  authorization. This is a deliberate, noted tradeoff against the MCP spec's OAuth 2.1 mandate --
  `js/ember` implements real OAuth 2.1 by delegating to Supabase as an authorization server, but
  that only makes sense where a Supabase/user-account system already exists. This app has neither,
  and standing one up solely to authenticate one user's MCP client is scope creep for a milestone
  meant to stay small. Revisit if this becomes a real interoperability problem.
- MCP surface: exactly one tool, `get_balances`, returning the same grouped-by-institution data as
  the dashboard page. No finer-grained tools (no per-account queries) until there's a reason to
  split.
- Transaction history is explicitly out of scope -- balances only, same as milestone 1.
- The real `SIMPLEFIN_ACCESS_URL`, the Vercel bypass secret, and the MCP bearer key are all set by
  hand in Vercel's project dashboard -- never generated, requested, or seen by an unattended
  orchestrator task. Same principle as milestone 1's `.env.local` handling.

### Milestone 3 — UX/UI

**Sequencing:** after milestone 2.

**Scope:**

- Reuse `js/ember`'s existing "Blocks" design system (shaped-panel/ink-shadow theme, components
  ported from `ember-finance`) rather than designing something new for this dashboard -- visual
  consistency across the finance apps, and a real head start over a from-scratch design exercise.
- No dedicated `"research"`-type task -- goes straight to a porting/implementation task, since the
  design system (and its patterns for panels/tables/lists) already exists; there isn't an open
  design question left to research.
- Includes responsive/mobile-friendly layout. This ties back to milestone 2's actual motivation
  ("check balances from my phone") -- a deployed page that's only comfortable on desktop undercuts
  that, and `ember`'s Blocks components are presumably already responsive from real multi-page use.

List only likely outcomes and dependencies. Grill and approve each milestone after reviewing evidence from the previous one; do not pre-authorize unattended execution of later milestones.
