# Instruction-file benchmark

Use this protocol to decide whether repository guidance improves successful work per token. Re-run it after substantial instruction changes or agent upgrades.

## Hypothesis

Concise, human-curated guidance can reduce repeated discovery and prevent repository-specific mistakes without adding enough irrelevant context to increase exploration or reasoning cost.

## Variants

Evaluate the variants relevant to the repository:

- **None:** no repository instruction file.
- **Commands-only:** exact commands and costly non-inferable rules.
- **Root router:** one root `AGENTS.md` with task-conditioned document links.
- **Sparse hierarchy:** root guidance plus only measured, path-scoped exceptions.
- **Workflow modules:** root guidance plus optional task-specific procedures loaded explicitly.
- **Incumbent:** the repository's current instructions, if different.

Do not let an agent generate an evaluated variant. Freeze every variant before running tasks.

## Task set

Choose 6–12 representative, independently verifiable tasks: a focused bug fix, a feature, a test change, a cross-component change, a docs/configuration change, and a resume-after-context-reset task. Avoid tasks whose solutions appear in the instruction files. Record task text and the starting commit.

## Controls

- Use the same repository snapshot, task text, agent/model version, permissions, and tool access.
- Start a fresh session for every run and randomize variant order.
- Run each task/variant at least three times when budget permits.
- Prevent cross-run memory or caches except provider prompt caching, which must be recorded.
- Keep failures and timeouts; do not selectively rerun them.

## Run manifest

Record these fields before each run so effective context is auditable:

- agent, model, model version, client version, and date;
- working directory and starting commit;
- instruction files discovered, discovery order, and whether each was automatic or explicitly loaded;
- effective instruction bytes, lines, and tokens when exposed or estimated;
- prompt-cache state and cached-input tokens;
- variant identifier, task identifier, repetition number, permissions, and tool access.

A claimed hierarchy or adapter benefit is invalid unless the manifest confirms what the agent actually loaded.

## Measurements

Write one row per run to `benchmark/results.csv`:

- **Primary:** verifier-defined success and estimated total cost.
- **Context:** input, cached-input, output, and reasoning tokens when exposed.
- **Search burden:** tool calls, files read, and calls before the first relevant file.
- **Operational:** elapsed time, tests attempted/passed, and instruction violations.
- **Recovery:** success and rediscovery cost after compaction or a fresh session.

Report success per 100k total tokens and cost per successful task; never interpret lower token use without correctness. Compare medians, dispersion, and per-task paired differences. With small samples, treat results as directional and retain raw traces.

## Decision rule

Adopt a variant only if it preserves or improves success and materially improves at least one cost/search metric without materially worsening another. Remove any instruction that causes extra work but does not prevent a measured failure. Prefer the simplest variant inside the uncertainty of the results.
