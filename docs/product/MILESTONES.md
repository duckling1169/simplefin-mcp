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

- **Milestone 2 (not yet grilled or approved):** Vercel deployment + an MCP server exposing account
  balances, likely alongside transaction history.
- **UX/UI milestone (not yet grilled or approved, sequencing TBD):** research and implement proper
  UX/UI, replacing milestone 1's plain CSS.

Do not draft tasks for either until milestone 1 is complete and each gets its own grill session.

List only likely outcomes and dependencies. Grill and approve each milestone after reviewing evidence from the previous one; do not pre-authorize unattended execution of later milestones.
