# Token-efficient agent project kit

Copy the files in this directory to a software repository, replace every bracketed field, and delete unused sections.

This is the **human-operated base**: a maintainer or contributor selects work and directs agents. When a repository instead needs bounded unattended execution of a human-approved milestone, apply [`../orchestrator-overlay/`](../orchestrator-overlay/) on top of this base. Keep the overlay out of repositories that do not use it.

## Document ownership

Use one canonical owner for each kind of guidance:

- `AGENTS.md` owns exact repository commands and costly, non-inferable instructions that agents need in recurring context.
- `CONTRIBUTING.md` owns durable contribution workflow shared by humans and agents.
- `CLAUDE.md` imports `AGENTS.md` because Claude Code does not natively read it; do not duplicate instructions in the adapter.
- Nested instruction files own only recurring path-specific exceptions that conflict with or refine root guidance.
- Automation is authoritative for rules it enforces. Prose should explain intent or contributor decisions without copying configuration.
- Issue and pull-request templates collect task-specific inputs and handoff information; they are not policy stores.
- In orchestrator-operated repositories, `.orchestrator/` owns machine-readable milestone, task, authority, and result contracts. Do not copy those contracts into always-loaded instructions.

Direct task instructions define the requested outcome. They do not silently override repository safety boundaries, required checks, or protected ownership. When instructions conflict materially, stop and ask the maintainer rather than inventing precedence.

Start with one root instruction file. Add path-scoped or nested rules only when a subsystem has a real, recurring conflict with root guidance and the target agent loads those rules on demand. A directory tree, dependency inventory, style rules already enforced by tools, tutorials, generic engineering advice, and long procedures do not belong in always-loaded context.

## Instruction budget

Apply the selection test below before optimizing for a number. As an initial diagnostic, aim for roughly 250–600 estimated tokens of always-loaded root guidance. Treat 600 as a soft warning threshold, not a quota or proof of quality. Fewer tokens are not better when a missing instruction permits an expensive recurring failure.

The checker estimates tokens from bytes and also checks file structure, adapter integrity, aggregate nested context, document ownership, and common content smells:

```sh
sh scripts/check-agent-docs.sh
```

By default findings are warnings. Set `AGENTS_CHECK_MODE=fail` in CI to make them blocking. Budgets are configurable with `AGENTS_MAX_BYTES`, `AGENTS_MAX_LINES`, `AGENTS_MAX_ESTIMATED_TOKENS`, `AGENTS_MAX_TOTAL_BYTES`, and `AGENTS_MAX_TOTAL_LINES`.

The operating range is evidence-informed, not a proven universal optimum. Tighten or relax it only after measuring representative tasks with [BENCHMARK.md](BENCHMARK.md). Passing the checker does not establish that instructions are correct or useful.

## Selection test for always-loaded instructions

Keep an instruction in `AGENTS.md` only if all are true:

1. It applies to most tasks or prevents a high-cost failure.
2. The agent cannot cheaply infer it from code, tests, or configuration.
3. It is concrete and verifiable.
4. It has a clear owner/source of truth and is still current.

Otherwise enforce it in tooling, move it to an on-demand document, or delete it.

## Selection test for contribution workflow

Keep a rule in `CONTRIBUTING.md` only when it repeatedly changes contributor decisions or prevents a meaningful failure, and neither automation nor task-specific instructions are a better owner. Prefer decision criteria and escalation triggers over exhaustive procedures.

## Durable-document rule

Update an existing durable document only when a code or workflow change makes it materially false. Keep detailed ownership and contribution rules in the document itself or `CONTRIBUTING.md`, not in always-loaded instructions. Do not create progress journals, status summaries, or completed-work ledgers; use Git history and pull requests.

Generated orchestration runs and reports are local execution evidence, not durable product documentation. Keep them ignored or publish them as CI artifacts unless the repository has a specific audit requirement.

## Optional adaptation

The default targets a solo maintainer and small-to-medium repository. Add stricter modules only when the context justifies their recurring maintenance cost—for example, substantial outside contribution, a monorepo with conflicting subsystem workflows, a large team, a regulated/high-assurance environment, or approved unattended milestone execution. Keep repository-specific adaptations visibly separate from reusable defaults.

The rationale, confidence levels, rejected practices, and evidence-maintenance guidance live in [research/CONTRIBUTION_WORKFLOW.md](research/CONTRIBUTION_WORKFLOW.md).