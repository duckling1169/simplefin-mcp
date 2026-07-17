# Milestones

This document records human-readable product outcomes and sequencing. The currently approved executable milestone lives in `.orchestrator/milestone.json`; do not duplicate task state here.

## Milestone 1 — Local balances dashboard

**Status:** proposed

**User-visible result:** Running the app locally (`pnpm run dev`) and opening the page shows every
account SimpleFin returns for the configured access URL, grouped by institution, with each
account's current balance and currency. No login screen, no other pages.

**Included:**

- Next.js (App Router, TypeScript) app scaffolded inside this repo, joined to the `js/` pnpm
  workspace, with working lint/typecheck/test/build scripts.
- A server-side route that calls SimpleFin's `/accounts` endpoint using an access URL read from a
  server-side-only environment variable (`SIMPLEFIN_ACCESS_URL`), and returns balances to the client.
- A single dashboard page rendering accounts grouped by institution/org with balance, currency, and
  as-of date, with clear loading/error states (missing env var, SimpleFin auth failure, network
  failure).
- Tests (unit + verifying the credential never reaches client-shipped code/responses) run against
  SimpleFin's public demo bridge, not real credentials.

**Excluded:**

- Transaction history, budgeting, categorization, multi-account editing.
- Any deployment target (Vercel, etc.) — local dev only.
- Any MCP server — deferred to milestone 2 alongside deployment.
- Multi-user auth — single operator, local machine only.

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
  balances, likely alongside transaction history. Do not draft tasks for this until milestone 1 is
  complete and this milestone gets its own grill session.

List only likely outcomes and dependencies. Grill and approve each milestone after reviewing evidence from the previous one; do not pre-authorize unattended execution of later milestones.
