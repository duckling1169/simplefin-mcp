# Contribution workflow research decision record

- Research cutoff: 2026-07-14
- Target context: solo maintainer; small-to-medium GitHub software repositories; multiple coding agents plus occasional human contributors
- Status: maintained synthesis, not an immutable standard

## Executive decision

Use a lean operational core plus on-demand workflow documentation:

1. `AGENTS.md` contains exact commands and costly, non-inferable instructions needed in recurring agent context.
2. `CONTRIBUTING.md` contains durable contribution workflow shared by humans and agents.
3. Tool-specific files import or point to canonical files instead of duplicating policy.
4. Automation enforces objective rules when proportionate; prose explains decisions, exceptions, and escalation boundaries.
5. Direct task instructions define the requested outcome but do not silently override safety, ownership, or required validation.

This is the default because it minimizes recurring context and policy drift while retaining the workflow information needed for safe contribution. Depart from it when measured repository failures, tool-loading behavior, compliance requirements, or contributor scale justify the added complexity.

## Confidence summary

| Decision | Confidence | Basis |
|---|---|---|
| Keep always-loaded instructions lean and repository-specific | High | Direct agent-context evaluations and official vendor guidance agree that irrelevant or duplicated context has a recurring cost; exact universal size optima remain unproven. |
| Use one canonical owner per policy category | High | Established documentation/configuration practice plus direct prevention of contradictory copied rules. |
| Put shared workflow in `CONTRIBUTING.md`, not duplicated agent adapters | Medium-high | Strong architectural inference from audience, loading cost, and drift risk; limited direct comparative trials of exact file layouts. |
| Validate observable behavior rather than incidental implementation | High | Long-standing software-testing evidence and refactor-resilience principles. |
| Require regression coverage for reproduced behavioral bugs when practical | High | Strong testing practice and direct defect-prevention rationale. |
| Make independent review risk-based rather than universal | Medium | Review and testing catch overlapping but different defect classes; agent-specific cost/benefit evidence is still limited. |
| Use one branch per task and one worktree per concurrent agent | Medium | Git isolation properties are direct; comparative agent-throughput evidence is limited and context-dependent. |
| Prefer PRs for non-trivial or risky work, not every trivial solo change | Medium | PRs provide durable CI/review/audit surfaces, but universal ceremony has weak evidence for tiny reversible changes. |
| Permit local reversible actions by default and require approval for consequential actions | High | Consequence- and reversibility-based safety model transfers well across tools and repositories. |

## Evidence hierarchy

Maintain this policy using, in order:

1. Direct empirical studies and reproducible evaluations.
2. Official Git, GitHub, OpenAI/Codex, and Anthropic/Claude documentation.
3. Relevant software-engineering, testing, review, and human/agent collaboration research.
4. Well-supported practitioner evidence where stronger evidence is unavailable.
5. Explicitly labeled synthesis or inference.

Do not turn measured effects from one agent, benchmark, language, or repository into universal numeric rules. Record contrary evidence and distinguish demonstrated results from transfer or convention.

## Why the files are divided this way

### `AGENTS.md`

Recurring context must earn its cost. Include an item only when it applies broadly or prevents an expensive failure, cannot be inferred cheaply from the repository, is concrete and verifiable, and has a current owner. Commands belong here once because both agents and humans can read the file.

Exclude project tours, directory inventories, generic coding advice, exhaustive style guidance already enforced by tools, long procedures, personality instructions, progress logs, and copied policy.

### `CONTRIBUTING.md`

This is the canonical home for workflow decisions that humans and agents need but that do not justify always-loaded context: acceptance criteria, isolation, testing decisions, review escalation, integration, handoff, safety boundaries, and documentation triggers.

The file should express defaults, decision tests, and escalation triggers rather than simulate a large-team process manual. Repository-specific placeholders should be removed when unused.

### Tool adapters and nested files

Adapters should import or point to canonical guidance. Nested files are justified only for real recurring path-specific conflicts and only when the target tool loads them appropriately. Copying the root file into multiple adapters or directories creates drift without adding knowledge.

### Automation and templates

Prefer formatters, linters, tests, CI, branch protection, and repository configuration for objective enforceable rules. Avoid automation whose setup, brittleness, or maintenance cost exceeds the expected failure cost in a small repository. PR and issue templates should collect task-specific evidence, not duplicate policy.

## Workflow default

### Planning

Tiny, obvious, reversible work needs only an understood outcome and a relevant check. Non-trivial work should identify observable acceptance criteria, validation, assumptions, affected boundaries, and rollback needs. Ambiguous, cross-cutting, costly-to-reverse, or weakly observable work warrants a structured challenge before implementation. A tool such as a local `grill-me` skill may implement that behavior, but the repository template remains vendor-neutral.

### Isolation and parallelism

Use one task branch per reviewable outcome. Use one worktree per concurrent agent. Sequential work may reuse a clean checkout. Never reset, stash, overwrite, rewrite, or delete unexplained work merely to obtain a clean state.

Parallelize only when subproblems have stable boundaries, little file overlap, limited dependence on unsettled decisions, and independent validation. Coordination, duplicate exploration, handoff, and merge costs can make one agent faster and more reliable.

### Testing

Translate acceptance criteria into checks of public behavior, integration boundaries, failure modes, and regressions. Prefer tests that survive legitimate refactors. Add a regression test for a behavioral bug when practical. For refactors, existing behavioral coverage may be enough. Do not add tests solely to increase counts or assert incidental representation.

Use the smallest relevant local checks for rapid feedback and the full suite for broad or consequential changes. CI remains authoritative where configured. Report failures, flakiness, skipped checks, and unavailable checks rather than laundering them into success.

### Review

Self-review every diff. Add independent agent or human review based on blast radius, reversibility, observability, permissions, novelty, testability, and operational or compatibility consequences. Do not require a second agent for every typo or fully covered reversible change.

Tests repeatedly detect deviations from specified behavior. Review is more likely to find missing requirements, unsafe assumptions, maintainability problems, and interactions no test author considered. Neither universally replaces the other.

### Integration and handoff

Use coherent outcome-based commits. Prefer a PR for non-trivial, risky, externally contributed, or concurrent work. A solo maintainer may integrate a trivial validated task branch directly when no required gate is bypassed.

A handoff should contain the changed observable outcome, checks actually run, testing decisions, risks or unresolved issues, relevant branch/worktree state, and the next action. Chronological activity logs and hidden-reasoning disclosures add cost without a reliable integration benefit.

### Safety and autonomy

Local reversible actions are normally permitted within task scope. Approval is required for destructive, externally consequential, privileged, or difficult-to-reverse actions. Risk is better modeled by consequences, permissions, reversibility, blast radius, observability, and recovery than by a long categorical list alone.

## Scenario checks

| Scenario | Default treatment |
|---|---|
| Trivial low-risk fix | Task branch; abbreviated acceptance check; focused validation; no mandatory independent review or PR. |
| Behavioral bug | Reproduce when practical; regression test of observable failure; focused plus relevant broader checks. |
| Behavior-preserving refactor | Preserve public contract; rely on existing behavioral coverage when sufficient; avoid implementation-detail tests. |
| Dependency and lockfile update | Canonical package tool; inspect transitive/lockfile effects; full relevant validation; review trust and compatibility consequences. |
| Schema or data migration | Explicit acceptance, test migration and rollback/recovery, elevated review, no production application without approval. |
| Concurrent features | Separate branches and worktrees; stable ownership boundaries; avoid overlapping edits and unsettled shared design. |
| Ambiguous architecture change | Clarify requirements and challenge plan before implementation. |
| Failing or unavailable CI | Do not claim completion; diagnose relation to the change; maintainer accepts any exception. |
| Dirty worktree | Preserve it; create isolated branch/worktree; do not reset or stash unexplained changes. |
| External contributor PR | Use PR workflow, documented checks, scoped review, and optional public-contribution module. |

## Rejected defaults

- **Comprehensive always-loaded manuals:** recurring token and attention cost is clear; correctness gains are inconsistent. Appropriate only when measured failures justify specific additions.
- **Duplicated commands or policy across adapters:** creates drift and contradiction. Use imports or pointers.
- **Mandatory worktrees for all sequential edits:** isolation benefit may not repay setup and cleanup cost in a clean single-owner checkout.
- **Maximum parallelism:** coordination and merge overhead can exceed execution savings.
- **A second-agent review for every change:** weak marginal value for tiny, observable, reversible changes with strong validation.
- **A PR for every solo edit:** useful as a gate and audit surface, but unnecessary ceremony for some trivial validated changes.
- **Tests for every changed line:** encourages implementation-detail assertions and test-count inflation.
- **Documentation updates for every change:** update when durable information becomes false or a contract/workflow changes.
- **Arbitrary hard token limits:** useful as diagnostics, not universal proof of quality.
- **Chronological handoff logs:** duplicate Git history while omitting the decision-relevant outcome and validation.
- **Agent personality or generic quality rules:** vague, difficult to verify, and usually inferior to concrete repository requirements.

## Deviation triggers

Strengthen or extend the default when:

- a monorepo has genuinely conflicting subsystem commands or constraints;
- many outside contributors need intake, conduct, licensing/DCO, security, or maintainer-response guidance;
- a large team needs explicit ownership, review routing, release coordination, or merge queues;
- regulation or assurance requirements demand traceability, segregation of duties, approvals, or retained evidence;
- repeated measured failures demonstrate that an omitted rule has greater cost than its recurring context and maintenance burden.

## Maintenance

Review this decision record when agent instruction-loading behavior changes, stronger studies appear, recurring failures expose a policy gap, or repository scale and risk change. A calendar review may be useful, but event-driven review is more important.

For each proposed rule, record:

1. the failure or decision it addresses;
2. why code, tests, configuration, or task instructions are not a better owner;
3. its recurring context and maintenance cost;
4. evidence and confidence;
5. the condition under which it should be removed.

Removing obsolete policy is part of maintenance. Repository-specific adaptations should be visibly labeled so reusable defaults can continue to evolve independently.