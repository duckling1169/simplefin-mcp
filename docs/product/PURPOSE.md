# Product purpose

## Problem

Adam's accounts (bank, credit, investment) are scattered across institutions with no single place
to see current balances without logging into each one separately. This repository also exists to
trial the agentic-devkit orchestrator overlay end-to-end on a real (small, low-risk) product, not
just a synthetic exercise like `py/config_validator`.

## Primary user

Adam, as the sole operator and sole user. Not a multi-tenant product — no signup, no other users,
no public deployment target for milestone 1.

## Desired outcome

A single local web page that shows current balances for every account linked through SimpleFin,
grouped by institution, without Adam needing to open each bank's site individually.

## Success measures

- Loading the local dev page shows every account SimpleFin returns, grouped by institution, with a
  current balance and currency.
- The SimpleFin access URL (which embeds a username:password credential) never reaches the browser
  — verified by inspecting network requests from the client, not just by code review.
- Whether the orchestrator's independent verifier catches a real security-boundary mistake (e.g. a
  task that accidentally exposes the credential) is itself a secondary thing this trial is measuring.

## Non-goals

- Not a budgeting, forecasting, or transaction-categorization tool (that overlap already exists in
  `google/v3`, `js/FIreApp`, and `js/ember-finance`).
- Not multi-user; no auth/login system in milestone 1.
- No transaction history in milestone 1 (balances only) — see `docs/product/MILESTONES.md`.
- No production deployment in milestone 1 — local dev only until a later, separately-grilled
  milestone.

## Product constraints

- SimpleFin credentials (the access URL) are read from a server-side-only environment variable and
  must never be sent to the browser, logged, or committed. This is a hard security boundary, not a
  style preference.
- Real SimpleFin credentials (Adam's actual bank access URL) are never given to an unattended
  implementer or verifier agent. Orchestrator tasks are built and verified against SimpleFin's
  public demo bridge (demo credentials, fake accounts); Adam supplies his real access URL into
  `.env.local` himself after a milestone is verified, outside the orchestrator's control.
- Next.js (App Router) + TypeScript, inside the `js/` pnpm workspace, matching the conventions
  already established by `js/ember-finance`. Data flows through a Server Component that calls
  SimpleFin directly -- no client-side API route in milestone 1.
- Plain CSS only in milestone 1, no styling framework. Proper UX/UI is deliberately deferred to a
  later, separately-grilled milestone rather than designed ad hoc alongside the data plumbing.
- The orchestrator commits locally to a `dev` branch only; nothing is pushed to a remote in
  milestone 1.

## Human authority boundaries

The maintainer retains authority over milestone approval, product-scope changes, public interfaces,
security boundaries, dependencies, releases, deployments, and exceptions to repository policy unless
a narrower permission is explicitly recorded.
