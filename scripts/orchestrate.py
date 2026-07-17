#!/usr/bin/env python3
"""Reference runner for one approved orchestrated milestone.

The runner deliberately owns task transitions while fresh agent processes own one
bounded task each. It is a starter, not a production scheduler: integration,
worktree provisioning, and repository-specific verification should be added as
explicit adapters rather than hidden inside prompts.

Everything likely to change per repository or as practices evolve — which agent
CLI runs a task, which VCS commands reset/commit/push, what counts as a
protected path, what a commit message looks like, retry/timing numbers, which
prompt file a task type uses — is data read from policy.json, not Python. This
script keeps only the control flow that data alone can't express: the
attempt/retry loop, the gating sequence (implementer -> protected-path check ->
hard gate -> independent verifier -> commit), and state bookkeeping.

Typing note: Policy/Task/Milestone are TypedDicts, not dict[str, Any] — still
plain dicts at runtime (json.dumps/`policy["execution"]` work exactly as
before), but load_policy()/load_task()/load_milestone() validate required
keys and fill in every optional one before the rest of the file ever sees
them, so nothing downstream needs a defensive `.get(..., default)`. The
attempt/retry/blocked-halt decision that used to repeat ~9 times inline in
main() is now two plain exceptions (Retry, Blocked; TimeExceeded for the
rate-limit case, which halts the run without blocking the task) raised by
small single-purpose gate functions and caught once, centrally, in main().
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NotRequired, TypedDict, cast

# Force UTF-8 and line buffering: Windows falls back to the console codepage
# when stdout is redirected to a file, which can crash on non-ASCII text; and
# block buffering means a tail -f on the redirected log sees nothing until
# this process exits. sys.stdout/stderr are typed as the narrower TextIO in
# typeshed, which doesn't declare .reconfigure() even though the real runtime
# object (TextIOWrapper) always has it.
sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)  # type: ignore[union-attr]
sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)  # type: ignore[union-attr]

ROOT = Path(__file__).resolve().parents[1]
ORCH = ROOT / ".orchestrator"
RUNS = ORCH / "runs"

# Must match RATE_LIMIT_EXIT_CODE in run_claude_task.py. A task agent_command
# exiting with this code means "rejected due to a session usage limit, not a
# genuine task failure" — sleep and retry without consuming an attempt. This is
# an internal contract between exactly these two scripts, not a preference
# anyone tunes, so it stays a Python constant rather than a policy.json field.
RATE_LIMIT_EXIT_CODE = 75
RATE_LIMIT_DEFAULT_WAIT_SECONDS = 30 * 60

# Default task "type" -> prompt-file mapping, and default verify prompt file —
# used only when policy.json does not set execution.prompt_files /
# execution.verify_prompt_file. Override or extend via policy.json instead of
# editing this — see ORCHESTRATOR_GUIDE.md's "Task type" section.
PROMPT_FILES = {
    "feature": "task-orchestrator.md",
    "research": "task-orchestrator-research.md",
}
VERIFY_PROMPT_FILE = "task-orchestrator-verify.md"

# Default deterministic gate the runner re-runs itself before trusting a
# verifier's approve. Overridable via policy.json's execution.hard_gate_command.
DEFAULT_HARD_GATE_COMMAND = ["sh", "scripts/verify-task.sh"]

DEFAULT_MAX_TASK_ATTEMPTS = 3
DEFAULT_STOP_AFTER_MINUTES = 480

# task.verify: "always" (default) sends every implementer result through a
# second, independent verifier agent before commit. "skip" goes straight from
# the hard gate to commit -- appropriate only when a task's acceptance is
# fully mechanically decided by hard_gate_command (deterministic pass/fail,
# nothing requiring judgment), since the hard gate is the part of this
# sequence that already re-runs checks independently of the implementer's
# self-report; the verifier's marginal job beyond that is judging things a
# script can't, e.g. whether a self-authored test actually asserts the right
# scenario. Set per task in the task's own JSON, not globally in policy.json,
# since risk is a property of the task, not the milestone.
TASK_VERIFY_VALUES = {"always", "skip"}


class OrchestrationError(RuntimeError):
    """Something is wrong with the setup itself (bad JSON, bad policy shape,
    a VCS command that couldn't run at all) — always fatal, never retried."""


class Retry(Exception):
    """Raised by a gate: this attempt failed, but the task may still succeed
    on a fresh attempt. Caught once in main(), which downgrades to Blocked
    itself if the attempt limit is exhausted."""


class Blocked(Exception):
    """Raised by a gate: halt the whole run for human review. No retry,
    regardless of attempts remaining."""


class TimeExceeded(Exception):
    """Raised by a gate: rate-limited, and waiting it out would exceed
    stop_after_minutes. Halts the run now, but the task itself did nothing
    wrong — it's left "ready" for the next run, not blocked or retried."""


# --- Typed shapes -------------------------------------------------------
#
# These validate + fully default policy.json/a task file/milestone.json once,
# in load_policy()/load_task()/load_milestone() below, so every other function
# in this file can assume a complete, well-typed structure instead of
# re-deriving defaults or guarding against missing keys. The raw dict
# straight out of json.loads() stays untyped (dict[str, Any]) but never
# leaves those three loader functions.


class ExecutionPolicy(TypedDict):
    max_task_attempts: int
    stop_after_minutes: int
    agent_command: list[str]
    enforce_hard_gate: bool
    enforce_protected_paths: bool
    hard_gate_command: list[str]
    prompt_files: dict[str, str]
    verify_prompt_file: str


class IntegrationPolicy(TypedDict):
    protected_branch: str | None


# vcs.json is an open-ended, swappable registry of named commands (add a new
# key to teach the runner a new VCS operation; omit a key to no-op it) — a
# fixed-key TypedDict would fight that on purpose, so this stays a dict typed
# by value shape (a command template or the commit message template) rather
# than by key.
VcsPolicy = dict[str, "list[str] | str"]


class Policy(TypedDict):
    execution: ExecutionPolicy
    vcs: VcsPolicy
    integration: IntegrationPolicy
    protected_paths: list[str]


class Task(TypedDict):
    id: str
    milestone_id: str
    title: str
    status: NotRequired[str]
    depends_on: NotRequired[list[str]]
    type: NotRequired[str]
    model: NotRequired[str]
    effort: NotRequired[str]
    verifier_model: NotRequired[str]
    verifier_effort: NotRequired[str]
    verify: NotRequired[str]


class Milestone(TypedDict):
    id: str
    status: str


class AttemptRecord(TypedDict, total=False):
    attempts: int
    status: str
    reason: str
    started_at: str
    completed_at: str
    result: str
    verify_result: str | None
    commit_message: str | None
    cost: str | None
    duration_seconds: float


class RunState(TypedDict):
    milestone_id: str
    tasks: dict[str, AttemptRecord]


@dataclass(frozen=True)
class Ctx:
    """Everything one task attempt needs, bundled once per attempt. Never
    mutated — the mutable per-attempt bookkeeping lives in AttemptRecord,
    passed alongside Ctx to gate functions that need to attach it."""

    policy: Policy
    milestone: Milestone
    task: Task
    task_id: str
    run_dir: Path
    base_prompt: str
    verify_base_prompt: str
    limit_minutes: int
    started: float


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise OrchestrationError(f"Missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise OrchestrationError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise OrchestrationError(f"Expected a JSON object in {path}")
    return value


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def _require_string(value: dict[str, Any], key: str, *, where: str) -> str:
    result = value.get(key)
    if not isinstance(result, str) or not result.strip():
        raise OrchestrationError(f"{where}: expected non-empty string field {key!r}")
    return result


def _string_array(value: Any, *, where: str, allow_empty: bool) -> list[str]:
    """Shared validation for the several policy.json fields that must be a
    string array (agent_command, hard_gate_command, protected_paths) —
    pulled out once so load_policy doesn't repeat the same isinstance/all()
    check per field."""
    ok = isinstance(value, list) and all(isinstance(part, str) for part in value)
    if not ok or (not allow_empty and not value):
        empty_note = "" if allow_empty else "non-empty "
        raise OrchestrationError(f"{where} must be a {empty_note}string array")
    return list(value)


def load_policy(path: Path) -> Policy:
    """Validate policy.json's required shape and resolve every optional
    execution.* field to its default — the one place in this file that
    reasons about a raw, unvalidated dict, so nothing else has to."""
    raw = load_json(path)

    execution_raw = raw.get("execution", {})
    if not isinstance(execution_raw, dict):
        raise OrchestrationError("policy 'execution' must be an object")

    agent_command = _string_array(
        execution_raw.get("agent_command"),
        where="policy execution.agent_command",
        allow_empty=False,
    )
    hard_gate_command = _string_array(
        execution_raw.get("hard_gate_command", DEFAULT_HARD_GATE_COMMAND),
        where="policy execution.hard_gate_command",
        allow_empty=True,
    )

    prompt_files_raw = execution_raw.get("prompt_files")
    prompt_files = (
        prompt_files_raw
        if isinstance(prompt_files_raw, dict) and prompt_files_raw
        else dict(PROMPT_FILES)
    )

    verify_prompt_file = execution_raw.get("verify_prompt_file")
    if not isinstance(verify_prompt_file, str) or not verify_prompt_file:
        verify_prompt_file = VERIFY_PROMPT_FILE

    execution: ExecutionPolicy = {
        "max_task_attempts": int(execution_raw.get("max_task_attempts", DEFAULT_MAX_TASK_ATTEMPTS)),
        "stop_after_minutes": int(
            execution_raw.get("stop_after_minutes", DEFAULT_STOP_AFTER_MINUTES)
        ),
        "agent_command": list(agent_command),
        "enforce_hard_gate": bool(execution_raw.get("enforce_hard_gate", True)),
        "enforce_protected_paths": bool(execution_raw.get("enforce_protected_paths", True)),
        "hard_gate_command": list(hard_gate_command),
        "prompt_files": dict(prompt_files),
        "verify_prompt_file": verify_prompt_file,
    }

    vcs_raw = raw.get("vcs", {})
    if not isinstance(vcs_raw, dict):
        raise OrchestrationError("policy 'vcs' must be an object if present")
    vcs: VcsPolicy = {}
    for key, value in vcs_raw.items():
        if key.startswith("_"):
            continue  # e.g. "_comment" — documentation, not a command
        if isinstance(value, str) or (
            isinstance(value, list) and all(isinstance(part, str) for part in value)
        ):
            vcs[key] = list(value) if isinstance(value, list) else value
        else:
            raise OrchestrationError(f"policy vcs.{key!r} must be a string or a string array")

    integration_raw = raw.get("integration", {})
    if not isinstance(integration_raw, dict):
        raise OrchestrationError("policy 'integration' must be an object if present")
    protected_branch = integration_raw.get("protected_branch")
    if protected_branch is not None and not isinstance(protected_branch, str):
        raise OrchestrationError("policy integration.protected_branch must be a string if present")
    integration: IntegrationPolicy = {"protected_branch": protected_branch}

    protected_paths = _string_array(
        raw.get("protected_paths", []), where="policy 'protected_paths'", allow_empty=True
    )

    return cast(
        Policy,
        {
            "execution": execution,
            "vcs": vcs,
            "integration": integration,
            "protected_paths": protected_paths,
        },
    )


def load_task(path: Path) -> Task:
    """Validate a task file's required keys; extra keys (outcome, acceptance,
    allowed_paths, ...) pass through untouched — the whole task dict is
    embedded verbatim into the implementer/verifier prompts."""
    raw = load_json(path)
    _require_string(raw, "id", where=str(path))
    _require_string(raw, "milestone_id", where=str(path))
    verify = raw.get("verify")
    if verify is not None and verify not in TASK_VERIFY_VALUES:
        raise OrchestrationError(
            f"{path}: 'verify' must be one of {sorted(TASK_VERIFY_VALUES)}, got {verify!r}"
        )
    return cast(Task, raw)


def load_milestone(path: Path) -> Milestone:
    """Validate milestone.json's required keys; extra keys (title, outcome,
    scope, acceptance, stop_conditions, ...) pass through untouched — the
    whole milestone dict is embedded verbatim into every task's prompt."""
    raw = load_json(path)
    _require_string(raw, "id", where=str(path))
    _require_string(raw, "status", where=str(path))
    return cast(Milestone, raw)


def task_files() -> list[Path]:
    return sorted(path for path in (ORCH / "tasks").glob("*.json") if ".example." not in path.name)


def completed_ids(state: RunState) -> set[str]:
    return {
        task_id for task_id, item in state["tasks"].items() if item.get("status") == "completed"
    }


def next_eligible(tasks: list[Task], state: RunState) -> Task | None:
    completed = completed_ids(state)
    for task in tasks:
        task_id = task["id"]
        current = state["tasks"].get(task_id, {}).get("status", task.get("status", "ready"))
        dependencies = task.get("depends_on", [])
        if current == "ready" and all(dep in completed for dep in dependencies):
            return task
    return None


def build_prompt(base: str, milestone: Milestone, policy: Policy, task: Task) -> str:
    return (
        base.rstrip()
        + "\n\n## Approved milestone\n\n```json\n"
        + json.dumps(milestone, indent=2)
        + "\n```\n\n## Repository policy\n\n```json\n"
        + json.dumps(policy, indent=2)
        + "\n```\n\n## Assigned task\n\n```json\n"
        + json.dumps(task, indent=2)
        + "\n```\n"
    )


def build_verify_prompt(
    base: str,
    milestone: Milestone,
    policy: Policy,
    task: Task,
    implementer_result: dict[str, Any],
) -> str:
    return (
        build_prompt(base, milestone, policy, task).rstrip()
        + "\n\n## Implementer's claimed result (unverified — re-check independently)\n\n```json\n"
        + json.dumps(implementer_result, indent=2)
        + "\n```\n"
    )


def render_command(
    template: list[str],
    *,
    prompt_file: Path,
    result_file: Path,
    task_id: str,
    model: str = "",
    effort: str = "",
    task_type: str = "",
) -> list[str]:
    replacements = {
        "{prompt_file}": str(prompt_file),
        "{result_file}": str(result_file),
        "{repo}": str(ROOT),
        "{task_id}": task_id,
        "{model}": model,
        "{effort}": effort,
        "{type}": task_type,
    }
    return [replace_all(part, replacements) for part in template]


def replace_all(value: str, replacements: dict[str, str]) -> str:
    for token, replacement in replacements.items():
        value = value.replace(token, replacement)
    return value


# --- VCS: templated argv arrays from policy.json's "vcs" block, so swapping
# git for another VCS (or tuning flags) is a JSON edit, not a Python edit. ---


def vcs_command(policy: Policy, name: str) -> list[str] | None:
    template = policy["vcs"].get(name)
    if template is None:
        return None
    if isinstance(template, str):
        raise OrchestrationError(f"policy vcs.{name!r} must be a command array, not a string")
    return list(template)


def run_vcs(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)


def reset_worktree(policy: Policy) -> None:
    """Discard any uncommitted changes before a fresh attempt starts.

    A retried task gets a brand-new implementer agent with no memory of the
    previous attempt, so leftover half-finished edits are more likely to
    confuse it than help — a clean worktree plus the carried-forward failure
    reason is the whole input a fresh attempt needs. No-ops (per command) when
    policy.json doesn't configure vcs.reset_checkout / vcs.reset_clean, so this
    stays safe on a policy.json that hasn't opted into VCS integration.
    """
    for name in ("reset_checkout", "reset_clean"):
        command = vcs_command(policy, name)
        if command is None:
            continue
        result = run_vcs(command)
        if result.returncode != 0:
            raise OrchestrationError(
                f"vcs.{name} failed: {result.stderr.strip() or result.stdout.strip()}"
            )


def changed_files(policy: Policy) -> list[str]:
    """Paths touched since the last commit, per `git status --porcelain`-style output.

    Deliberately not the implementer's own self-reported `changed_files` field
    — that's unverified self-report, same reason the hard gate re-runs checks
    itself rather than trusting reported exit codes.
    """
    command = vcs_command(policy, "status")
    if command is None:
        return []
    result = run_vcs(command)
    if result.returncode != 0:
        raise OrchestrationError(
            f"vcs.status failed: {result.stderr.strip() or result.stdout.strip()}"
        )
    paths: list[str] = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        # porcelain v1: two status chars, a space, then the path (or
        # "orig -> new" for a rename) — take the path after the status chars,
        # and the destination side of any rename.
        candidate = line[3:] if len(line) > 3 else line.strip()
        if " -> " in candidate:
            candidate = candidate.split(" -> ", 1)[1]
        paths.append(candidate.strip().strip('"'))
    return paths


def protected_path_violations(paths: list[str], protected_paths: list[str]) -> list[str]:
    violations = []
    for path in paths:
        normalized = path.replace("\\", "/")
        for protected in protected_paths:
            protected_norm = protected.replace("\\", "/")
            is_prefix = normalized == protected_norm or normalized.startswith(
                protected_norm.rstrip("/") + "/"
            )
            if is_prefix or fnmatch.fnmatch(normalized, protected_norm):
                violations.append(path)
                break
    return violations


def run_hard_gate(policy: Policy) -> tuple[bool, str]:
    """Runner-owned re-run of the repository's own verification command.

    Never trust the implementer's self-reported check exit codes, and never
    trust the verifier's word that it ran this — run it here, deterministically,
    ourselves, before a commit is even considered.
    """
    result = subprocess.run(
        policy["execution"]["hard_gate_command"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    output = (result.stdout or "") + (result.stderr or "")
    return result.returncode == 0, output[-4000:]


def current_branch(policy: Policy) -> str | None:
    command = vcs_command(policy, "current_branch")
    if command is None:
        return None
    result = run_vcs(command)
    if result.returncode != 0:
        raise OrchestrationError(
            f"vcs.current_branch failed: {result.stderr.strip() or result.stdout.strip()}"
        )
    return result.stdout.strip()


def head_commit(policy: Policy) -> str | None:
    """The checked-out commit hash, or None if vcs.head_commit isn't
    configured. Used to detect an agent committing on its own during its
    turn (it has Bash access) instead of leaving that to commit_and_push --
    see run_no_self_commit_gate."""
    command = vcs_command(policy, "head_commit")
    if command is None:
        return None
    result = run_vcs(command)
    if result.returncode != 0:
        raise OrchestrationError(
            f"vcs.head_commit failed: {result.stderr.strip() or result.stdout.strip()}"
        )
    return result.stdout.strip()


def commit_and_push(policy: Policy, task: Task, task_id: str) -> str | None:
    """Runner-owned commit, only ever reached after an independent verifier
    approved and the hard gate passed. The implementer never commits its own
    work — see ORCHESTRATOR_GUIDE.md's "Independent verification" section for
    why nothing LLM-authored is trusted to decide when it's safe to share.
    Returns the commit message used, or None if VCS integration isn't
    configured in policy.json (vcs.stage_all / vcs.commit unset) or there was
    nothing to commit.

    Refuses outright if the checked-out branch is the protected branch
    (integration.protected_branch) — unattended tasks land on a non-protected
    branch (dev, master, whatever), never on the one a human alone controls.
    """
    protected_branch = policy["integration"]["protected_branch"]
    if protected_branch:
        branch = current_branch(policy)
        if branch is not None and branch == protected_branch:
            raise OrchestrationError(
                f"refusing to commit: checked-out branch {branch!r} is the protected branch "
                "(integration.protected_branch); check out a non-protected branch before "
                "running the orchestrator"
            )

    stage_command = vcs_command(policy, "stage_all")
    commit_command = vcs_command(policy, "commit")
    if stage_command is None or commit_command is None:
        return None

    stage_result = run_vcs(stage_command)
    if stage_result.returncode != 0:
        raise OrchestrationError(
            f"vcs.stage_all failed: {stage_result.stderr.strip() or stage_result.stdout.strip()}"
        )

    message_template = policy["vcs"].get(
        "commit_message_template", "orchestrator({task_id}): {task_title}"
    )
    if not isinstance(message_template, str):
        raise OrchestrationError("policy vcs.commit_message_template must be a string")
    message = replace_all(
        message_template, {"{task_id}": task_id, "{task_title}": task.get("title", task_id)}
    )
    rendered_commit = [replace_all(part, {"{message}": message}) for part in commit_command]
    commit_result = run_vcs(rendered_commit)
    if commit_result.returncode != 0:
        combined = (commit_result.stdout + commit_result.stderr).lower()
        if "nothing to commit" in combined:
            return None
        raise OrchestrationError(
            f"vcs.commit failed: {commit_result.stderr.strip() or commit_result.stdout.strip()}"
        )

    push_command = vcs_command(policy, "push")
    if push_command is not None:
        push_result = run_vcs(push_command)
        if push_result.returncode != 0:
            raise OrchestrationError(
                f"vcs.push failed: {push_result.stderr.strip() or push_result.stdout.strip()}"
            )

    return message


def run_agent_once(
    *,
    command_template: list[str],
    prompt_text: str,
    run_dir: Path,
    prompt_filename: str,
    stdout_filename: str,
    stderr_filename: str,
    result_filename: str,
    task_id: str,
    model: str,
    effort: str,
    task_type: str,
    limit_minutes: int,
    started: float,
    label: str,
) -> tuple[str, dict[str, Any] | None]:
    """Run one agent process (implementer or verifier) to completion.

    Handles the rate-limit sleep-and-retry loop internally so callers don't
    duplicate it per agent role. Returns (status, result):
      "ok"            - result is the parsed result dict
      "process_failed" - the process exited non-zero or wrote no result file
      "time_exceeded"  - rate-limited and honoring the wait would exceed
                         stop_after_minutes
    """
    prompt_file = run_dir / prompt_filename
    result_file = run_dir / result_filename
    prompt_file.write_text(prompt_text, encoding="utf-8")
    command = render_command(
        command_template,
        prompt_file=prompt_file,
        result_file=result_file,
        task_id=task_id,
        model=model,
        effort=effort,
        task_type=task_type,
    )

    while True:
        with (
            prompt_file.open("r", encoding="utf-8") as stdin,
            (run_dir / stdout_filename).open("w", encoding="utf-8") as stdout,
            (run_dir / stderr_filename).open("w", encoding="utf-8") as stderr,
        ):
            completed = subprocess.run(
                command, cwd=ROOT, stdin=stdin, stdout=stdout, stderr=stderr, check=False
            )

        if completed.returncode == RATE_LIMIT_EXIT_CODE:
            resets_at = read_resets_at(run_dir)
            now = time.time()
            wait_seconds = (
                (resets_at - now + 30)
                if resets_at and resets_at > now
                else RATE_LIMIT_DEFAULT_WAIT_SECONDS
            )
            remaining_seconds = limit_minutes * 60 - (time.monotonic() - started)
            if wait_seconds > remaining_seconds:
                return "time_exceeded", None
            print(
                f"{label} for {task_id} rate-limited; sleeping {int(wait_seconds)}s "
                "before retrying (not counted as an attempt)"
            )
            time.sleep(wait_seconds)
            continue

        if completed.returncode != 0 or not result_file.exists():
            return "process_failed", None

        return "ok", load_json(result_file)


def read_resets_at(run_dir: Path) -> float | None:
    path = run_dir / "rate_limit.json"
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8")).get("resets_at")
    except (OSError, json.JSONDecodeError):
        return None
    return float(value) if isinstance(value, (int, float)) else None


def task_cost_summary(milestone_dir: Path, task_id: str) -> str:
    """Best-effort implement-vs-verify cost breakdown for a task, read from
    the milestone's usage.jsonl (written by run_claude_task.py's log_usage).
    Sums across every attempt, including retries -- the implementer and
    verifier are separately tagged there specifically so this can answer
    "what did the second (verifier) agent cost", not just a combined total.
    """
    usage_path = milestone_dir / "usage.jsonl"
    if not usage_path.exists():
        return ""
    totals = {"implement": 0.0, "verify": 0.0}
    for line in usage_path.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if record.get("task_id") != task_id:
            continue
        role = record.get("role", "implement")
        cost = record.get("total_cost_usd")
        if role in totals and isinstance(cost, (int, float)):
            totals[role] += cost
    if not any(totals.values()):
        return ""
    total = totals["implement"] + totals["verify"]
    return f"implement=${totals['implement']:.4f} verify=${totals['verify']:.4f} total=${total:.4f}"


def format_duration(seconds: float) -> str:
    """Human-readable wall-clock duration for a completed attempt, e.g. "45s"
    or "4.2min". Mirrors task_cost_summary's role as a completion-time
    reader-friendly readout, not an audit trail -- the authoritative source
    is still started_at/completed_at on the AttemptRecord itself.
    """
    if seconds < 60:
        return f"{seconds:.0f}s"
    return f"{seconds / 60:.1f}min"


def validate_result(result: dict[str, Any], task_id: str) -> None:
    """Validate the implementer's self-reported result.

    The implementer's own `review` field is its self-assessment for the
    record only — it does not gate completion. The actual gate is a separate
    independent verify-agent result, checked by validate_verify_result below,
    plus the runner's own protected-path check and hard gate re-run.
    """
    if result.get("task_id") != task_id:
        raise OrchestrationError("Result task_id does not match the claimed task")
    if result.get("outcome") not in {"completed", "blocked", "failed"}:
        raise OrchestrationError("Result outcome must be completed, blocked, or failed")
    if not isinstance(result.get("needs_human"), bool):
        raise OrchestrationError("Result needs_human must be boolean")
    if not isinstance(result.get("retryable"), bool):
        raise OrchestrationError("Result retryable must be boolean")
    if result.get("outcome") == "completed":
        failed_checks = [item for item in result.get("checks", []) if item.get("exit_code") != 0]
        if failed_checks:
            raise OrchestrationError("Completed result contains failed checks")


def validate_verify_result(result: dict[str, Any], task_id: str) -> None:
    if result.get("task_id") != task_id:
        raise OrchestrationError("Verify result task_id does not match the claimed task")
    if result.get("decision") not in {"approve", "reject"}:
        raise OrchestrationError("Verify result decision must be approve or reject")
    if not isinstance(result.get("needs_human"), bool):
        raise OrchestrationError("Verify result needs_human must be boolean")
    if result.get("decision") == "approve" and result.get("unresolved_findings"):
        raise OrchestrationError("Verify result cannot approve with unresolved findings")


# --- Gates: each is one step of the sequence implementer -> protected-path
# check -> hard gate -> independent verifier -> commit. The verifier step is
# skipped when the task sets "verify": "skip" (see TASK_VERIFY_VALUES) --
# every other gate always runs. Each gate raises Retry, Blocked, or
# TimeExceeded to signal anything other than "this step passed, keep going"
# — see the exception docstrings above. Extra bookkeeping a gate knows about
# (which result file exists, which doesn't) is attached directly to `record`
# before raising, same mutable dict main() already writes to disk after
# every attempt.


def run_implementer_gate(ctx: Ctx, record: AttemptRecord) -> dict[str, Any]:
    status, result = run_agent_once(
        command_template=ctx.policy["execution"]["agent_command"],
        prompt_text=build_prompt(ctx.base_prompt, ctx.milestone, ctx.policy, ctx.task),
        run_dir=ctx.run_dir,
        prompt_filename="prompt.md",
        stdout_filename="stdout.log",
        stderr_filename="stderr.log",
        result_filename="result.json",
        task_id=ctx.task_id,
        model=ctx.task.get("model", ""),
        effort=ctx.task.get("effort", ""),
        task_type=ctx.task.get("type") or "feature",
        limit_minutes=ctx.limit_minutes,
        started=ctx.started,
        label="implement",
    )
    if status == "time_exceeded":
        raise TimeExceeded("rate_limited_wait_exceeds_time_budget")
    if status == "process_failed":
        raise Retry("agent_process_failed")
    assert result is not None  # guaranteed by run_agent_once's "ok" contract

    try:
        validate_result(result, ctx.task_id)
    except OrchestrationError as exc:
        if result.get("retryable"):
            raise Retry(str(exc)) from exc
        raise Blocked(str(exc)) from exc

    result_file = ctx.run_dir / "result.json"
    if result.get("needs_human") or result.get("outcome") == "blocked":
        record["result"] = str(result_file)
        raise Blocked(result.get("summary", "human review required"))
    if result.get("outcome") == "failed":
        record["result"] = str(result_file)
        if result.get("retryable"):
            raise Retry(result.get("summary", "implementer reported a retryable failure"))
        raise Blocked(result.get("summary", "implementer reported a non-retryable failure"))

    return result


def run_protected_path_gate(ctx: Ctx) -> None:
    if not ctx.policy["execution"]["enforce_protected_paths"]:
        return
    try:
        touched = changed_files(ctx.policy)
    except OrchestrationError as exc:
        raise Blocked(f"could not determine changed files: {exc}") from exc
    violations = protected_path_violations(touched, ctx.policy["protected_paths"])
    if violations:
        raise Blocked("protected_path_violation: " + ", ".join(violations))


def run_hard_gate_check(ctx: Ctx) -> None:
    if not ctx.policy["execution"]["enforce_hard_gate"]:
        return
    gate_ok, gate_output = run_hard_gate(ctx.policy)
    (ctx.run_dir / "hard-gate-output.log").write_text(gate_output, encoding="utf-8")
    if not gate_ok:
        raise Retry("hard_gate_failed")


def run_verifier_gate(
    ctx: Ctx, record: AttemptRecord, implementer_result: dict[str, Any]
) -> dict[str, Any]:
    status, verify_result = run_agent_once(
        command_template=ctx.policy["execution"]["agent_command"],
        prompt_text=build_verify_prompt(
            ctx.verify_base_prompt, ctx.milestone, ctx.policy, ctx.task, implementer_result
        ),
        run_dir=ctx.run_dir,
        prompt_filename="verify-prompt.md",
        stdout_filename="verify-stdout.log",
        stderr_filename="verify-stderr.log",
        result_filename="verify_result.json",
        task_id=ctx.task_id,
        model=ctx.task.get("verifier_model", ""),
        effort=ctx.task.get("verifier_effort", ""),
        task_type="verify",
        limit_minutes=ctx.limit_minutes,
        started=ctx.started,
        label="verify",
    )
    verify_result_file = ctx.run_dir / "verify_result.json"

    if status == "time_exceeded":
        raise TimeExceeded("verifier_rate_limited_wait_exceeds_time_budget")
    if status == "process_failed":
        raise Retry("verifier_process_failed")
    assert verify_result is not None

    try:
        validate_verify_result(verify_result, ctx.task_id)
    except OrchestrationError as exc:
        raise Retry(f"verifier: {exc}") from exc

    if verify_result.get("needs_human"):
        record["result"] = str(ctx.run_dir / "result.json")
        record["verify_result"] = str(verify_result_file)
        raise Blocked(verify_result.get("summary", "verifier requires human review"))

    if verify_result.get("decision") == "reject":
        record["verify_result"] = str(verify_result_file)
        raise Retry("verifier rejected: " + "; ".join(verify_result.get("unresolved_findings", [])))

    return verify_result


def run_no_self_commit_gate(ctx: Ctx, head_before: str | None) -> None:
    """The implementer and verifier both run with Bash access (needed for
    tests/lint/etc.) and nothing stops either from running `git commit`
    itself instead of leaving that to the runner. A prompt saying not to
    is advisory, not enforced — this is the actual enforcement: if HEAD
    moved at all since reset_worktree, at any point before this runner's
    own commit_and_push, that's an unauthorized commit. It already can't
    be undone by reset_worktree (which only cleans the working tree, not
    history), so this halts for human review rather than retrying past it.
    """
    if head_before is None:
        return  # vcs.head_commit not configured; nothing to compare against
    head_now = head_commit(ctx.policy)
    if head_now != head_before:
        raise Blocked(
            f"unauthorized_commit: HEAD moved from {head_before} to {head_now} "
            "before the runner's own commit gate ran -- the implementer or "
            "verifier committed on its own"
        )


def run_commit_gate(ctx: Ctx, record: AttemptRecord) -> str | None:
    """Runner itself performs the commit/push — never the implementer — only
    now that both the deterministic hard gate and the independent verifier
    have signed off. See commit_and_push's docstring."""
    verify_result_path = ctx.run_dir / "verify_result.json"
    record["result"] = str(ctx.run_dir / "result.json")
    record["verify_result"] = str(verify_result_path) if verify_result_path.exists() else None
    try:
        return commit_and_push(ctx.policy, ctx.task, ctx.task_id)
    except OrchestrationError as exc:
        raise Blocked(f"commit_failed: {exc}") from exc


def attempt_task(ctx: Ctx, record: AttemptRecord) -> str | None:
    """Runs the full gating sequence for one attempt. Returns the commit
    message (or None if nothing to commit / VCS unconfigured) on success.
    Raises Retry / Blocked / TimeExceeded for every other outcome — the
    caller in main() updates state uniformly for all three."""
    try:
        reset_worktree(ctx.policy)
        head_before = head_commit(ctx.policy)
    except OrchestrationError as exc:
        raise Blocked(f"could not reset worktree: {exc}") from exc

    result = run_implementer_gate(ctx, record)
    run_protected_path_gate(ctx)
    run_hard_gate_check(ctx)
    if ctx.task.get("verify", "always") != "skip":
        verify_result = run_verifier_gate(ctx, record, result)
        del verify_result  # approved; nothing further to read from it
    run_no_self_commit_gate(ctx, head_before)
    return run_commit_gate(ctx, record)


def main() -> int:  # noqa: C901 -- the eligibility loop + attempt_task()'s
    # try/except Retry/Blocked/TimeExceeded is one linear, top-to-bottom
    # sequence by design (see module docstring); splitting it further would
    # redistribute this complexity into a second function rather than
    # remove it. Deliberate tradeoff, confirmed in design review.
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show eligible task and command without launching an agent",
    )
    args = parser.parse_args()

    milestone = load_milestone(ORCH / "milestone.json")
    policy = load_policy(ORCH / "policy.json")
    if milestone["status"] != "approved":
        raise OrchestrationError("Milestone status must be 'approved' before execution")

    tasks = [load_task(path) for path in task_files()]
    if not tasks:
        raise OrchestrationError("No executable task JSON files found; rename or copy the example")
    milestone_id = milestone["id"]
    for candidate in tasks:
        if candidate["milestone_id"] != milestone_id:
            raise OrchestrationError(
                f"Task {candidate['id']} does not belong to milestone {milestone_id}"
            )

    state_path = RUNS / milestone_id / "state.json"
    state: RunState = (
        cast(RunState, load_json(state_path))
        if state_path.exists()
        else {"milestone_id": milestone_id, "tasks": {}}
    )
    started = time.monotonic()
    limit_minutes = policy["execution"]["stop_after_minutes"]
    max_attempts = policy["execution"]["max_task_attempts"]

    while True:
        if time.monotonic() - started > limit_minutes * 60:
            print("Stopped: execution time limit reached", file=sys.stderr)
            return 2

        task = next_eligible(tasks, state)
        if task is None:
            incomplete = [
                item["id"]
                for item in tasks
                if state["tasks"].get(item["id"], {}).get("status") != "completed"
            ]
            if incomplete:
                print(
                    "Stopped: no eligible task; blocked or unmet dependencies: "
                    + ", ".join(incomplete)
                )
                return 2
            print(
                f"Milestone {milestone_id} complete. "
                "Start the next milestone only after human approval."
            )
            return 0

        task_id = task["id"]
        record = state["tasks"].setdefault(task_id, {"attempts": 0})
        if record.get("attempts", 0) >= max_attempts:
            record["status"] = "blocked"
            record["reason"] = "retry_limit_reached"
            write_json(state_path, state)
            print(f"Stopped: {task_id} reached retry limit", file=sys.stderr)
            return 2

        attempt = record.get("attempts", 0) + 1
        task_type = task.get("type") or "feature"
        prompt_files = policy["execution"]["prompt_files"]
        prompt_filename = prompt_files.get(
            task_type, prompt_files.get("feature", PROMPT_FILES["feature"])
        )
        base_prompt = (ORCH / "prompts" / prompt_filename).read_text(encoding="utf-8")
        verify_base_prompt = (
            ORCH / "prompts" / policy["execution"]["verify_prompt_file"]
        ).read_text(encoding="utf-8")
        run_dir = RUNS / milestone_id / task_id / f"attempt-{attempt}"
        run_dir.mkdir(parents=True, exist_ok=True)

        if args.dry_run:
            preview_command = render_command(
                policy["execution"]["agent_command"],
                prompt_file=run_dir / "prompt.md",
                result_file=run_dir / "result.json",
                task_id=task_id,
                model=task.get("model", ""),
                effort=task.get("effort", ""),
                task_type=task_type,
            )
            print(
                json.dumps(
                    {
                        "task": task_id,
                        "command": preview_command,
                        "prompt_file": str(run_dir / "prompt.md"),
                    },
                    indent=2,
                )
            )
            return 0

        record.update(
            {
                "status": "running",
                "attempts": attempt,
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        write_json(state_path, state)

        ctx = Ctx(
            policy=policy,
            milestone=milestone,
            task=task,
            task_id=task_id,
            run_dir=run_dir,
            base_prompt=base_prompt,
            verify_base_prompt=verify_base_prompt,
            limit_minutes=limit_minutes,
            started=started,
        )

        try:
            commit_message = attempt_task(ctx, record)
        except TimeExceeded as exc:
            record["status"] = "ready"
            record["reason"] = str(exc)
            write_json(state_path, state)
            print(f"Stopped: {task_id} {exc}", file=sys.stderr)
            return 2
        except Retry as exc:
            record["status"] = "ready" if attempt < max_attempts else "blocked"
            record["reason"] = str(exc)
            write_json(state_path, state)
            if record["status"] == "blocked":
                print(f"Stopped: {task_id}: {exc}", file=sys.stderr)
                return 2
            continue
        except Blocked as exc:
            record["status"] = "blocked"
            record["reason"] = str(exc)
            write_json(state_path, state)
            print(f"Stopped: {task_id}: {exc}", file=sys.stderr)
            return 2

        cost_note = task_cost_summary(RUNS / milestone_id, task_id)
        completed_at = datetime.now(timezone.utc)
        started_at = datetime.fromisoformat(record["started_at"])
        duration_seconds = (completed_at - started_at).total_seconds()
        record.pop("reason", None)
        record.update(
            {
                "status": "completed",
                "completed_at": completed_at.isoformat(),
                "commit_message": commit_message,
                "cost": cost_note or None,
                "duration_seconds": duration_seconds,
            }
        )
        write_json(state_path, state)
        committed_note = commit_message or "no vcs integration configured"
        cost_suffix = f" ({cost_note})" if cost_note else ""
        duration_suffix = f" ({format_duration(duration_seconds)})"
        verify_note = "verify skipped (task opted out)" if task.get("verify") == "skip" else (
            "independently verified"
        )
        print(
            f"Completed {task_id}; {verify_note}; committed ({committed_note}); "
            f"cost{cost_suffix}; duration{duration_suffix}; selecting the next eligible task"
        )


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OrchestrationError as exc:
        print(f"orchestration error: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
