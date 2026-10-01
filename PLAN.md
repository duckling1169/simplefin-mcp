# End state: simplefin-mcp and valorant-mcp

Two public, MIT-licensed, self-hostable MCP servers that read as a matched pair. Each repo's own
Vercel deployment is its website. Delete this file once both repos match it.

## Shared

**Model.** Whoever deploys a copy owns it. There is no central service and no data held for other
people, except friends the owner explicitly invites (valorant-mcp only).

**Deploy.** A "Deploy to Vercel" button and Vercel's Supabase integration. After deploying, the
owner sets at most three env vars:

| Variable | Purpose |
| --- | --- |
| `OWNER_PASSWORD` | Unlocks the owner's setup page. |
| `SUPABASE_*` | Synced by the Supabase integration. |
| Project API key | valorant-mcp only: `HENRIKDEV_API_KEY`. |

Migrations run automatically, so no Supabase dashboard steps are needed.

**Auth.** A connector URL with a random key: `https://<deploy>/mcp?key=<key>`. The key also works
as `Authorization: Bearer`. Only the key's SHA-256 is stored, and anything secret behind it is
encrypted under a key derived from it. A connection is cut off by deleting its row. There is no
OAuth and no Supabase Auth; Supabase only stores data.

**Tools.** All tools are read-only and annotated `readOnlyHint`. Upstream calls are cached in
Supabase so upstream rate limits are respected.

**Code layout.**

```
app/
  page.tsx          landing page: what it is, example prompts, tools, self-host guide
  setup/            owner page behind OWNER_PASSWORD: mint, list and revoke connector URLs
  mcp/route.ts      key lookup, then the MCP handler
lib/
  <upstream>.ts     the API client
  cache.ts          caching of upstream calls
  tools.ts          pure tool logic
  connections.ts    keys and encryption
supabase/migrations/
tests/              pure logic and the route with mocked upstreams
```

**Website** (`app/page.tsx`):
- A hero section with a one-line pitch and a demo GIF.
- Example prompts and a tool reference.
- "Connect" tabs for Claude, ChatGPT and Cursor.
- "Self-host in 5 minutes": the Deploy button and the env var table.
- The security model and FAQ.

**README.** Same order in both: pitch, GIF, a link to the site, the tool table, the Deploy button,
connecting a client, the security model, development, and license. The two projects do not link to each other.

**Repo hygiene.** MIT `LICENSE`, CI (format, typecheck, test) with a badge, and
`.env.example`. A short `AGENTS.md` for contributors. No orchestrator or agent workflow files, and
no planning docs.

## simplefin-mcp

**Current state:** 5 tools; connection keys plus an encrypted snapshot cache; the setup page is
open to anyone.

**To do:**
1. Move the setup flow to `/setup` behind `OWNER_PASSWORD`. Show existing connections with
   `last_used_at` and a revoke button.
2. Rebuild `/` as the landing page described above.
3. Demo mode: if `DEMO=1`, the public deployment serves SimpleFin's demo account to a published
   demo connector URL.
4. Make migrations run automatically on deploy, add CI, the Deploy button, the README, and a
   GIF.
5. Remove `pnpm-workspace.yaml` if the standalone build doesn't need it.

## valorant-mcp

**Current state:** 8 tools, Supabase OAuth, invite and claim flow, `consented_profiles` /
`mcp_users` / `mcp_invites`, match cache, 100+ tests.

**To do:**
1. Replace OAuth with connection keys:
   - Drop the login, consent and callback pages.
   - Drop `/.well-known/oauth-protected-resource`, JWT verification, and the `jose` and
     `@supabase/ssr` dependencies.
   - Replace `mcp_users` with `connections (key_hash, puuid, ...)`.
2. Set the owner's Riot ID at first run on `/setup`. That creates the owner's consented profile
   and connector URL.
3. Friends:
   - On `/setup` the owner enters a friend's Riot ID, which creates a single-use claim link.
   - The friend opens it, sees what they are consenting to, and accepts.
   - Accepting creates their consented profile and shows *their* connector URL.
   - This replaces the admin curl endpoint and the email login.
4. Keep the HenrikDev client, match cache, the 8 tools and the tests. Restructure into the shared
   layout.
5. Website, README, CI and Deploy button as above. Remove `ARCHITECTURE.md`, `CONTRIBUTING.md`
   and the agent-docs check script, or fold them into the README.

## Order of work

1. simplefin-mcp, items 1 to 5. It's smaller and sets the shared pattern.
2. valorant-mcp, items 1 to 5, reusing simplefin's `connections.ts`, setup page and landing
   page.
3. A final consistency pass across both READMEs and sites.
