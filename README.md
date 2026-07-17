# simplefin-dashboard

A local web page showing current account balances aggregated via SimpleFin, grouped by institution.

## Quick start

Prerequisites: Node.js 20+, pnpm (workspace root: `js/`).

```sh
CI=true pnpm install --frozen-lockfile
cp .env.example .env.local   # set SIMPLEFIN_ACCESS_URL
pnpm run dev
```

## Verify

```sh
pnpm run lint
pnpm run verify   # lint + typecheck + test + build
```

## Normal use

Open `http://localhost:3000` after `pnpm run dev`. The page lists every account SimpleFin returns
for the configured `SIMPLEFIN_ACCESS_URL`, grouped by institution, with current balance and
currency. See `docs/product/PURPOSE.md` for why this exists and `docs/product/MILESTONES.md` for
current scope.

## Project documents

- [ARCHITECTURE.md](ARCHITECTURE.md): boundaries, data flow, and public contracts.
- [CONTRIBUTING.md](CONTRIBUTING.md): development and release workflow.
- [BACKLOG.md](BACKLOG.md): bounded near-term work.
- [ROADMAP.md](ROADMAP.md): optional longer-term direction.
- [ORCHESTRATOR_GUIDE.md](ORCHESTRATOR_GUIDE.md): how this repository's orchestrator overlay works.

