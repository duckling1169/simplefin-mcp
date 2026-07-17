# Project instructions

## Commands

- Setup: `CI=true pnpm install --frozen-lockfile`
- Fast check: `pnpm run lint && pnpm run typecheck`
- Full check: `./scripts/verify-task.sh` (lint, typecheck, test, build)
- Build: `pnpm run build`

## Non-inferable rules

- `SIMPLEFIN_ACCESS_URL` is a credential (a URL with embedded username:password). Read it only in
  server-side code (Server Components / server-only modules). Never expose it via `NEXT_PUBLIC_*`,
  never render it or SimpleFin's raw auth headers into a response, never log it.
- Milestone 1 has no client-side API route and no client-side fetch of SimpleFin data — data flows
  through a Server Component only. See `ARCHITECTURE.md` before changing this boundary.
- Build and verify tasks against SimpleFin's public demo bridge
  (`https://demo:demo@beta-bridge.simplefin.org/simplefin`), never against a real linked account.
  Real credentials only ever go into a local, gitignored `.env.local` the maintainer edits by hand —
  never write, request, or hardcode a real access URL anywhere in the repo.
- Plain CSS only in milestone 1 — do not add a styling framework.
- This repo is joined to the `js/` pnpm workspace (`js/pnpm-workspace.yaml`) but is built and
  deployed standalone, matching `js/ember-finance`'s convention: keep its own `pnpm-lock.yaml` in
  sync with `package.json` (a dependency change updates both this repo's lockfile and, if run from
  `js/`, the workspace root's).
- The orchestrator commits to the `dev` branch only (`main` is `policy.json`'s protected branch);
  nothing is pushed to a remote in milestone 1.
- Do not expand scope beyond the approved milestone in `.orchestrator/milestone.json`.

## Completion requirements

- Follow the shared workflow and escalation rules in `CONTRIBUTING.md`.
- Run the relevant checks above and report anything not run.
- Report observable behavior changed, validation results, and unresolved risks.
- Update an existing durable document only when the change makes it materially false. Do not create status logs or completed-work ledgers; Git history is the record.

## Read on demand

- `README.md`: purpose, setup, and normal use.
- `ARCHITECTURE.md`: before changing boundaries, contracts, or cross-component behavior.
- `CONTRIBUTING.md`: before non-trivial implementation or integration work; canonical shared contribution workflow.
- `BACKLOG.md`: when planning or resuming work, not for every task.
- `ROADMAP.md`: only when a task depends on longer-term direction.