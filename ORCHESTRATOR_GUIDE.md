# Orchestrator-operated project overlay

Apply this directory on top of `templates/software-project/` when a repository should execute a human-approved milestone through a persistent runner and fresh, bounded task agents.

This overlay is intentionally small and framework-neutral. It uses JSON contracts and a Python standard-library reference runner. Replace the runner only after the operating model works for representative tasks.

## Responsibility split

- **Human maintainer:** defines purpose, approves one milestone, resolves escalations, and reviews integration policy.
- **Outer runner:** selects eligible tasks, persists state, launches one fresh task orchestrator at a time, validates structured results, and stops at the milestone boundary.
- **Task orchestrator (implementer):** owns exactly one task, implements it, repairs findings within scope, and emits a structured result with its own self-assessment. It does not verify itself, and its own review decision does not gate completion.
- **Verifier:** a second, separate agent process the runner launches after the implementer reports "completed" — same task, none of the implementer's context, own model/effort. Independently re-runs the deterministic checks itself and reviews behavior, tests, risks, and unnecessary complexity. Its `approve`/`reject` verdict is what actually gates completion (see "Independent verification" below).

Agents do not select the next task. A completed task does not authorize starting another milestone. This still holds when running a pre-approved queue of several milestones unattended (see "Running multiple approved milestones unattended" below): the outer `queue.py` wrapper only ever advances to a milestone you already flipped to `"approved"` before the run started — it does not itself decide that a milestone is ready, draft one, or approve one.

## Install into a new repository

Prefer the root scaffolding CLI:

```sh
python3 bin/agentic-devkit new <target> \
  --mode orchestrated \
  --name <project-name> \
  --non-interactive \
  --dry-run \
  --json
```

Review the plan, repeat without `--dry-run`, resolve the reported placeholders, then run:

```sh
python3 bin/agentic-devkit doctor <target> --json
```

Manual copying remains possible: copy `templates/software-project/` first, then this overlay into the same repository root. The modules intentionally contain no duplicate destination paths.

## Bootstrap workflow: from scaffold to approved milestone

There are two structurally different phases, and they should not run in the same process.

**Phase 1 — interactive setup session.** Open a coding agent in a location with access to both this devkit repository and the destination path (e.g. a parent directory containing both, or `--add-dir` to pull one in). In one continuous session:

1. Scaffold: `python3 bin/agentic-devkit new <target> --mode orchestrated ...`.
2. Vision grill: one broad, maintainer-led interview covering purpose, primary user, desired outcome, success measures, and non-goals. Write the answers into `docs/product/PURPOSE.md` and the high-level sequencing into `ROADMAP.md`. Do this once per repository, not once per milestone.
3. Milestone grill: a narrower interview scoped to exactly the next milestone — what's included, what's explicitly excluded, and what counts as acceptance evidence. Write `docs/product/MILESTONES.md`'s entry and `.orchestrator/milestone.json` (leave `status` as `"draft"`). Do this again before each future milestone; do not pre-author or pre-approve later milestones from the vision grill alone.
4. Draft the bounded task JSONs in `.orchestrator/tasks/` against the grilled milestone. Task-level decomposition (how many tasks, exact acceptance criteria per task) can be proposed by the agent against the already-grilled milestone scope rather than separately interviewed — but the maintainer should read the breakdown before approval, not just the milestone summary. Phrase each `acceptance` entry as a named scenario with a concrete, checkable outcome — not a vague paraphrase — the same discipline a Given/When/Then would force, without the keyword scaffolding: state what situation is being set up and what must observably be true afterward, in one sentence. No Gherkin or BDD framework needed; if the repository already has a behavioral-test naming convention (test names and assertion messages that state the scenario and why it's correct, not `test_case_1` with a bare value check — see `godot/townlet/CONTRIBUTING.md` for a real example), follow that instead of inventing a separate acceptance-phrasing style. See `.orchestrator/tasks/m1-001.example.json`.
5. Run `python3 bin/agentic-devkit doctor <target> --json` until every check passes except `milestone_approved`.
6. Maintainer reviews the drafted milestone and tasks, then flips `.orchestrator/milestone.json` `status` to `"approved"`.

**Phase 2 — the runner is a separate, deliberately detached command.** Once approved, run `python3 scripts/orchestrate.py` yourself, as an explicit action — do not let the setup session chain into it automatically. This is not a continuation of the setup conversation: each task the runner dispatches spawns a brand-new, isolated agent process (via `agent_command`) that sees only the milestone, policy, and its one assigned task — never the setup session's grill conversation or any other task's context. That isolation is intentional (see Responsibility split above); collapsing phase 1 and phase 2 into one long session would leak vision-grill framing and prior-task context into what's supposed to be a bounded, fresh execution.

## Execute an approved milestone

After configuring the generated repository:

```sh
python3 scripts/orchestrate.py --dry-run
python3 scripts/orchestrate.py
```

The default policy is deliberately conservative: one task at a time, no automatic merging, no dependency or workflow changes, and bounded retries.

## Running multiple approved milestones unattended (overnight)

`scripts/orchestrate.py` executes exactly one already-approved milestone and stops — that contract is unchanged and is not where multi-milestone chaining lives. `scripts/queue.py` is a separate, thin wrapper on top of it, so `orchestrate.py`'s tested single-milestone behavior never has to change to support this:

```sh
python3 scripts/queue.py --dry-run
python3 scripts/queue.py
```

`queue.py` reads `.orchestrator/queue.json` — an explicit, ordered list of milestone ids you finalize before walking away, not an inferred order. For each id in turn it:

1. Stages `.orchestrator/milestones/<id>/{milestone.json,tasks/}` into the active slot `orchestrate.py` reads (`.orchestrator/milestone.json` + `.orchestrator/tasks/`).
2. Runs the unmodified `scripts/orchestrate.py` as a subprocess (stdio inherited, so a redirected log stays tailable).
3. Advances to the next queued milestone only on a clean exit `0` ("this milestone is genuinely, fully complete"); halts the entire queue immediately on any other exit code, same as a single-milestone run would.

Each milestone in the queue must independently already be `"status": "approved"` in its own `milestones/<id>/milestone.json` — `queue.py` never approves anything and never invents which milestone runs next; it only walks what you already signed off on, in the order you listed. Re-running `queue.py` after a halt skips milestones already recorded `"completed"` in `.orchestrator/runs/queue-state.json` and resumes from where it stopped.

`queue.json`'s `max_total_minutes` bounds the *whole run's* wall clock, independent of each milestone's own `execution.stop_after_minutes` in `policy.json` — sizing several milestones' individual budgets for their worst case can sum to far more than you actually want unattended overnight, so this is a second, outer ceiling checked between milestones.

## Deterministic gates the runner enforces itself

Two checks moved from "the agent is asked to respect this" to "the runner enforces this in code, independent of what any LLM claims," because neither should depend on an LLM remembering an instruction correctly on an unattended overnight run:

- **Protected paths** (`policy.json`'s `protected_paths`): after an implementer claims `"completed"`, the runner runs `vcs.status` itself and checks the actually-changed files against `protected_paths` — not the implementer's self-reported `changed_files` field. A match is an **immediate block, no retry** (a fresh attempt has no reason to behave differently), and halts the run for human review, distinct from a normal retryable failure. Toggle with `execution.enforce_protected_paths` (default `true`).
- **Hard gate** (`execution.hard_gate_command`, default `["sh", "scripts/verify-task.sh"]`): before ever spawning the independent verifier agent, the runner re-runs the repository's own deterministic verification command itself. A failure is just a retryable failed attempt, and — because there's nothing yet worth an LLM's judgment call — **the verifier is never spawned**, saving that cost. Only once the hard gate passes does the runner spend a verifier call on the judgment-only part of review (unnecessary complexity, missed edge cases, intent match) that a script genuinely can't check. Toggle with `execution.enforce_hard_gate` (default `true`).

Both exist because, even in this design, the only thing that ultimately gates a commit today is a second LLM's `"decision": "approve"` — real independence (fresh context, told to re-run checks itself) but still nothing outside that agent's own session confirms it actually did. These two gates close the part of that gap that a deterministic check can close; the rest (does this actually address the task's intent, is it unnecessarily complex) is legitimately judgment work left to the verifier.

## Who commits, and when

The **implementer never runs `git commit` itself.** Committing is the runner's job, executed only after both gates above pass and the independent verifier's `decision` is `"approve"` — see `commit_and_push` in `orchestrate.py`. This keeps a verifier's eventual `"reject"` cheap to recover from (nothing was ever shared; the next attempt's `reset_worktree` step just discards the local changes) instead of needing to un-push something already visible elsewhere.

Before every attempt — including retries — the runner hard-resets the worktree (`vcs.reset_checkout` + `vcs.reset_clean`) and carries the previous attempt's failure reason forward into the new prompt instead of leaving partial edits for the next, entirely fresh implementer agent to interpret.

`policy.json`'s `vcs` block is a set of templated argv arrays, the same `{token}`-substitution pattern `execution.agent_command` already uses — swapping git for another VCS, or tuning flags, is a JSON edit. Leaving `vcs.stage_all`/`vcs.commit` unset disables commit/push entirely (the runner then just leaves verified work uncommitted in the worktree for you to handle by hand). Commit messages come from `vcs.commit_message_template` (`{task_id}`/`{task_title}` tokens).

`vcs`/`execution.enforce_hard_gate`/`execution.enforce_protected_paths`/`execution.prompt_files`/`execution.verify_prompt_file` are all read with safe fallbacks matching the previous hardcoded behavior, so an older `policy.json` that predates these fields still runs — it just doesn't get the new gates or commit automation until you opt in.

## Contracts

- `.orchestrator/milestone.json` / `.orchestrator/tasks/*.json`: the currently **active** milestone slot `orchestrate.py` reads — approved outcome, scope, acceptance, stop conditions, and that milestone's bounded tasks.
- `.orchestrator/milestones/<id>/{milestone.json,tasks/}`: a queued milestone's own copy of the same shape, staged into the active slot by `queue.py` when its turn comes. Not read directly by `orchestrate.py`.
- `.orchestrator/queue.json`: explicit, ordered list of milestone ids to run unattended in one go, plus `max_total_minutes`.
- `.orchestrator/policy.json`: execution limits, agent command, VCS commands, permissions, and protected paths.
- `.orchestrator/schemas/task-result.schema.json`: result shape expected from the implementer.
- `.orchestrator/schemas/verify-result.schema.json`: verdict shape expected from the independent verifier.
- `.orchestrator/runs/`: generated state, prompts, logs, and results, including `queue-state.json`. Ignore or retain as local audit evidence; do not treat it as durable product documentation.

## Agent command

`policy.json` contains an argument-vector template. The runner replaces `{prompt_file}`, `{result_file}`, `{repo}`, and `{task_id}`.

Example Codex-style command:

```json
["codex", "exec", "--sandbox", "workspace-write", "--output-schema", ".orchestrator/schemas/task-result.schema.json", "--output-last-message", "{result_file}", "-"]
```

The reference runner sends the generated task prompt to stdin. Adapt the command to the installed CLI and verify its current flags before unattended use.

**This same `agent_command` template is reused for the independent verify call**, with `{type}` becoming `"verify"` and a different schema needed (`verify-result.schema.json`, not `task-result.schema.json`). The raw codex example above hardcodes `--output-schema` to the implementer's schema, so it would validate a verifier's output against the wrong shape — a CLI wired in directly like that needs its own `{type}`-driven schema selection (see how `run_claude_task.py`'s `SCHEMA_FILE_BY_TYPE` does it) before it's safe to use for both calls.

**Claude Code CLI has no equivalent of `--output-last-message`** — nothing in the CLI writes the final result straight to a file. It does have `--json-schema <schema>`, which validates the agent's final message against a JSON Schema and returns it pre-parsed as a `structured_output` field in the `--output-format json` envelope. That gets most of the way there, but the schema must have its top-level `$schema` and `title` keys stripped first (the CLI rejects `$schema: "https://json-schema.org/draft/2020-12/schema"` with "no schema with key or ref ..."), and something still has to lift `structured_output` out of the envelope and write it to `{result_file}`. Use a one-file wrapper as the `agent_command` target instead of calling `claude` directly:

```json
["python3", "scripts/run_claude_task.py", "{result_file}"]
```

The wrapper reads the prompt from stdin (the runner already redirects it there), strips `$schema`/`title` from `.orchestrator/schemas/task-result.schema.json`, calls `claude -p --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools Bash --json-schema <stripped-schema>`, relays each turn's assistant text/tool calls live (so the runner's per-task `stdout.log` is actually tailable instead of empty until the task finishes), and writes the final `result` event's `structured_output` field to `{result_file}`. This is more reliable than asking the agent to emit "raw JSON, no markdown fences" in the prompt and hoping it complies — the CLI enforces the shape itself.

**`--allowedTools Bash` is not optional.** `--permission-mode acceptEdits` auto-accepts file writes but still prompts for arbitrary shell execution — and headless, there's no one to click "approve." Without it, a task agent that needs to run its own verification command (pytest, etc.) will stall on every `Bash` call, likely try to route around it (e.g. delegating to an async sub-agent it then can't actually wait for, since nothing resumes a one-shot headless process later), and can end up submitting a hollow placeholder result just to satisfy the schema rather than an honest one. `.orchestrator/prompts/task-orchestrator.md` explicitly warns against exactly that async-delegation trap for the same reason.

**Per-task model and effort.** A task JSON may set optional `"model"` and `"effort"` fields (both plain strings, e.g. `"claude-haiku-4-5-20251001"` / `"low"`; leave `""` or omit to inherit the CLI's default) — these govern the implementer call only. See "Independent verification" below for the parallel `"verifier_model"`/`"verifier_effort"` fields. The runner passes them through as the `{model}`/`{effort}` tokens available to `agent_command` — pass the exact values you want rather than routing them through an abstraction like a risk tier: low/medium effort is usually the best performance-per-cost point anyway, so most tasks will cluster there, and a task that genuinely needs more just says so directly:

```json
["python3", "scripts/run_claude_task.py", "{result_file}", "{model}", "{effort}", "{type}"]
```

**Task type: feature vs. research.** A task JSON may set an optional `"type"` field (defaults to `"feature"` when unset or unrecognized). The runner uses it to pick which prompt a task's agent runs under (`PROMPT_FILES` in `orchestrate.py`), and passes it through as the `{type}` token so `run_claude_task.py` can pick the right `--allowedTools` (`ALLOWED_TOOLS_BY_TYPE`):

- `"feature"` (default) — `.orchestrator/prompts/task-orchestrator.md`. Deliverable is working code; verification is a deterministic command (`verify-task.sh`); needs `Bash`.
- `"research"` — `.orchestrator/prompts/task-orchestrator-research.md`. Deliverable is a written document with real, checkable sources, not code; there's no test-suite equivalent, so verification leans on the independent verifier checking acceptance-criterion coverage and spot-checking that cited sources actually say what's claimed; needs `Bash WebSearch WebFetch` (acceptEdits alone still prompts for both headlessly, same as Bash).

A third type worth naming but not yet built: a `"plan"` task whose deliverable is a milestone/task breakdown rather than product work. It can't literally replicate an interactive maintainer grill session headlessly (there's no human to answer questions mid-run) — it would need reframing as "draft a candidate breakdown against the already-approved vision, and flag every place you're guessing rather than certain" for the maintainer to then grill and adjust, not a replacement for the grill itself. Add it (`PROMPT_FILES["plan"]`, an `ALLOWED_TOOLS_BY_TYPE["plan"]` entry, and a `task-orchestrator-plan.md` prompt) the same way as `research` when you actually need it.

## Independent verification

Verification is never in-session delegation by the implementer — it is a second, separate agent process the runner launches itself after the implementer reports `outcome: "completed"`, using `.orchestrator/prompts/task-orchestrator-verify.md` and `.orchestrator/schemas/verify-result.schema.json`. This is not gated by a task's `"type"`; every task type gets the same separate verify call. The verifier is given the task, milestone, and the implementer's claimed result JSON — never the implementer's transcript or reasoning — and is expected to independently re-run the repository's own checks itself rather than trust the implementer's self-reported exit codes.

A task JSON may set optional `"verifier_model"` and `"verifier_effort"` fields, parallel to `"model"`/`"effort"` but scoped to the verify call only (leave `""` or omit to inherit the CLI default). This is where you'd deliberately run the verifier on a different/stronger model than the implementer if you want that independence to also mean "a different perspective," not just "a fresh context window."

The runner's gate is the verifier's `decision`: `"approve"` (with no `unresolved_findings`) marks the task `completed`; `"reject"` returns the task to `"ready"` for another implementer attempt (consuming the same retry budget as `max_task_attempts`) carrying the verifier's findings forward as the failure reason; `needs_human: true` stops the runner for maintainer review, same as an implementer requesting it. The implementer's own `review` field in `task-result.schema.json` is retained only as its self-assessment for the audit trail — it does not gate anything.

**Opting a task out of verification.** A task JSON may set `"verify": "skip"` (default is `"always"`) to go straight from the hard gate to commit, spending no verifier call at all. This is a per-task decision, not a milestone- or policy-wide one, because it depends on the task's own risk, not the milestone it belongs to. Reach for it only when a task's acceptance is fully and mechanically decided by `hard_gate_command` — a deterministic pass/fail a script can already check, with nothing left requiring judgment. The hard gate already re-runs checks independently of the implementer's self-report; the verifier's remaining marginal value beyond that is judgment a script can't perform — e.g. whether a self-authored test actually asserts the claimed scenario rather than a tautology, or whether the change is within scope. Keep verification on (the default) for anything with ambiguous or subjective acceptance criteria, security-sensitive changes, or tasks whose own tests will become part of the hard gate for later tasks (a weak test there silently degrades protection for everything downstream).

## Session usage limits

`run_claude_task.py` detects a Claude Code session-usage-limit rejection (the `rate_limit_event` stream carries `status: "rejected"` — distinct from a genuinely broken task) and exits with `RATE_LIMIT_EXIT_CODE` (75) instead of the generic failure path, writing a `rate_limit.json` sidecar next to the result file with the reported reset time (`resets_at`, epoch seconds).

`orchestrate.py` treats that exit code specially: it does **not** count the attempt against `max_task_attempts`, sleeps until `resets_at` (plus a 30s buffer; falls back to a fixed 30-minute wait if no reset time was captured, e.g. the very first call in the session was rejected before any `rate_limit_event` line streamed), then retries the same task automatically. The sleep counts against `stop_after_minutes` — if honoring it would exceed the milestone's remaining time budget, the runner stops cleanly instead ("Stopped: ... rate-limited and the wait would exceed stop_after_minutes") rather than sleeping past what was approved.

## Usage tracking

Every `run_claude_task.py` invocation appends one JSON line to `.orchestrator/runs/<milestone>/usage.jsonl` — task id, outcome, cost, token counts, model, and turn count from that invocation's final `result` event — regardless of whether the task succeeded, failed, or was rate-limited. This is passive record-keeping only (no enforcement, no live running total, no spend cap); it exists so a milestone's actual cost is auditable after the fact. A `max_cost_usd`-style enforced cap, analogous to `stop_after_minutes`, is a natural next step but isn't built.

## Safety model

The runner rejects execution when the milestone is not approved, a dependency is incomplete, retries exceed policy, a result cannot be parsed, the task ID does not match, or an agent requests human judgment. Deterministic repository checks remain authoritative; agent agreement alone is not completion.

Begin with pull-request or local-branch output and human integration. Enable broader autonomy only after repeated runs demonstrate sound decomposition, verification, and repository quality.
