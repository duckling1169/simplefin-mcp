# Project instructions

See `README.md` for purpose and architecture.

## Commands

- Setup: `CI=true pnpm install --frozen-lockfile`
- Check: `pnpm verify` (format, typecheck, test); `pnpm build` before deploying

## Rules

- SimpleFin access URLs and connection keys are credentials. Handle them only in server code;
  never log them, return them in errors, or expose them via `NEXT_PUBLIC_*`.
- Test against SimpleFin's public demo bridge
  (`https://demo:demo@beta-bridge.simplefin.org/simplefin`), never a real account.
- Plain CSS only.
- Keep `pnpm-lock.yaml` in sync with `package.json`; the repo deploys standalone on Vercel.
- The schema lives in `lib/db.ts` (`create table if not exists`, applied on first use).
