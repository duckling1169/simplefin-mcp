# Contributing

This file is the source of truth for durable contribution workflow shared by humans and coding agents. Exact repository commands and costly, non-inferable agent instructions belong in `AGENTS.md`; tool-specific files should import or point to canonical guidance rather than copy it. Automated checks are authoritative for rules they enforce.

## Before changing code

For a tiny, obvious, reversible change, confirm the expected outcome and proceed with the smallest relevant check.

For non-trivial work, identify before implementation:

- the observable acceptance criteria;
- the smallest useful validation plan;
- important assumptions, affected boundaries, and rollback needs.

Challenge the plan before coding when requirements are ambiguous, the change is cross-cutting or hard to reverse, or meaningful behavior is difficult to observe or test. A repository-local planning or questioning tool may help, but must not be required unless documented in `AGENTS.md`.

Pause for maintainer judgment when the requested outcome remains materially ambiguous, required access or secrets are unavailable, unrelated user work cannot be preserved safely, or the proposed action crosses an approval boundary below.

## Isolation and ownership

- Use one task branch per independently reviewable outcome. Do not make agent-authored commits directly on the default branch unless the maintainer explicitly requests it.
- Use a separate worktree for each concurrently active agent. Sequential work may reuse a clean checkout when ownership is unambiguous.
- If the current worktree contains unrelated or unexplained changes, preserve it and create an isolated branch or worktree instead of resetting, stashing, or overwriting it.
- Do not rewrite, squash, delete, force-update, or otherwise alter commits, branches, worktrees, or files owned by another contributor without explicit permission.
- Split parallel work only when subtasks have stable boundaries, limited overlap, and independently verifiable outcomes. Prefer one agent when design decisions are unsettled or coordination and merge cost are likely to exceed the benefit.

## Verification

Exact commands are defined once in `AGENTS.md`.

| Change | Minimum validation |
|---|---|
| Documentation or metadata only | Review the rendered or consumed result; run the documented check when one exists. |
| Focused implementation change | Run the smallest relevant behavioral test and applicable fast checks. |
| Behavioral bug fix | Reproduce the failure when practical and add or update a regression test that fails for the old behavior. |
| Refactor intended to preserve behavior | Run existing tests covering the affected public behavior; add tests only where a meaningful contract is otherwise unprotected. |
| Cross-cutting, dependency, CI, migration, or public-interface change | Run the full check plus targeted validation of the consequential boundary. |

Tests should verify observable contracts, outcomes, integration boundaries, and failure modes—not incidental storage, call order, private helpers, or module layout unless those details are themselves contractual. BDD-style examples are useful when they clarify behavior; Gherkin or a BDD framework is not required.

A new test is not mechanically required for every edit. It may add little value when existing behavioral coverage already exercises the changed outcome, the change is non-executable documentation, or the test would merely restate an implementation detail. Record that decision at handoff.

Treat CI as authoritative when available, but do not hide local failures, flaky checks, skipped checks, or unavailable infrastructure. A failing required check blocks completion unless the failure is demonstrated to be unrelated and the maintainer accepts the exception. Never report a check as passing when it was not run.

## Review and risk

Self-review the diff and validation results before handoff. Independent review is risk-based rather than mandatory for every change.

Escalate to an independent agent or human reviewer when several of these are high or uncertain:

- blast radius or permissions;
- difficulty of rollback;
- weak observability or testability;
- novelty or architectural reach;
- security, data, compatibility, or operational consequences.

Typical candidates include authentication and authorization, schema or data migrations, infrastructure, CI policy, dependency trust boundaries, generated release artifacts, and public APIs. Strong behavioral tests and independent review are complementary: tests repeatedly check specified outcomes, while review is better suited to missing requirements, unsafe assumptions, maintainability problems, and untested interactions.

## Commits, pull requests, and integration

- Keep commits coherent and outcome-based. Use checkpoints when they improve recoverability, but avoid ceremonial micro-commits.
- Prefer a pull request for non-trivial, externally contributed, concurrently developed, or elevated-risk work because it provides a review surface, CI gate, and durable handoff.
- A solo maintainer may integrate a validated task branch without a pull request when the change is trivial, reversible, isolated, and no required repository gate is bypassed.
- Do not merge with required checks failing, skipped without explanation, or unavailable unless the maintainer explicitly accepts the risk.
- Agents may create local branches and commits by default. Pushing, opening a pull request, resolving disputed review feedback, or merging requires either direct task authorization or an explicit repository policy.

Use the repository's configured merge strategy. Do not rewrite another contributor's published history merely to make it cosmetically tidy.

## Safety and approval boundaries

Preserve unrelated and pre-existing changes. Never expose secrets, credentials, private keys, tokens, personal data, or sensitive command output in code, logs, commits, issues, or pull requests.

Local and readily reversible actions—reading files, running documented checks, editing task-owned files, creating a branch or worktree, and making local commits—are normally safe within the requested scope.

Get explicit approval before actions that are destructive, externally consequential, privileged, or difficult to reverse, including:

- deleting or overwriting user data or unexplained files;
- force pushes, history rewrites, branch deletion, or destructive Git cleanup;
- pushing or merging when not already authorized;
- publishing packages or releases;
- applying schema or data migrations outside an isolated test environment;
- changing production infrastructure, authentication, authorization, secrets, billing, or access controls;
- weakening tests, CI, branch protection, security controls, or auditability;
- adding or substantially changing dependencies when trust, licensing, runtime, lockfile, or supply-chain consequences are unclear.

Generated files and lockfiles should be updated only through their canonical tools. Explain unexpected generated changes rather than editing around them. For costly-to-reverse work, state the rollback or recovery path before integration.

## Documentation

Update durable documentation when a change makes it materially false or changes a user-visible contract, contributor workflow, operational procedure, or non-obvious invariant. Do not require documentation churn for every implementation change, and do not create chronological progress journals or completed-work ledgers; Git history and pull requests are the record.

## Handoff

A useful handoff states only what the next contributor needs:

- observable behavior changed;
- validation actually run and its result;
- tests added, omitted, or deferred and why;
- known risks, assumptions, or unresolved issues;
- branch and worktree state when relevant;
- the suggested next action.

Do not provide a chronological activity log or hidden-reasoning transcript.

## Project-specific rules

- Dependencies: pnpm, inside the `js/` workspace (`js/pnpm-workspace.yaml`). Adding a dependency
  requires updating both this repo's own lockfile and (per pnpm workspace behavior) staying
  installable via `pnpm install` from `js/`. No new runtime dependency without maintainer approval.
- CI and merging: solo maintainer project; no CI configured yet in milestone 1.
- Releases: N/A — local dev only in milestone 1.
- Additional protected surfaces: `SIMPLEFIN_ACCESS_URL` and any other SimpleFin credential must
  never be committed, logged, sent to the client, or given to an unattended agent. Orchestrator
  tasks use SimpleFin's public demo bridge only — see `docs/product/PURPOSE.md`.

Delete placeholders and sections that do not apply. Add policy only when it changes contributor decisions or prevents a meaningful recurring failure.