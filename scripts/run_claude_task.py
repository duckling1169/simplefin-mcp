"""Invoke Claude Code headlessly for one bounded orchestrator task.

The reference runner (orchestrate.py) pipes the generated task prompt to this
script's stdin, redirects this script's own stdout/stderr to a per-call log
file, and expects JSON written to the path given as argv[1], shaped by
whichever schema matches argv[4]'s task type (`SCHEMA_FILE_BY_TYPE`):
`task-result.schema.json` for an implementer ("feature"/"research"), or
`verify-result.schema.json` for the independent verifier orchestrate.py calls
separately as its own agent process with type "verify".

Claude Code has no CLI-native equivalent of `codex exec --output-last-message`,
but `--json-schema` makes it validate the final message against the schema and
return it pre-parsed as `structured_output` on the final `result` event, so
this wrapper only has to lift that field out and write it to the result file.

It uses `--output-format stream-json --verbose` (batch `--output-format json`
would work too, but buffers the entire session in memory and prints nothing
until the agent is completely done — with stream-json we relay each turn's
assistant text and tool calls to our own stdout as they happen, which the
runner's redirect already turns into a tailable live log per task).

Use as the policy.json agent_command, with model/effort/type read straight from
each task's own "model"/"effort"/"type" fields (empty string when the task
doesn't set model/effort, which means "inherit the CLI's default"; type
defaults to "feature" when unset or unrecognized):
  ["python3", "scripts/run_claude_task.py", "{result_file}", "{model}", "{effort}", "{type}"]

Every invocation appends one line to
`.orchestrator/runs/<milestone>/usage.jsonl` — a persisted audit trail of what
each task actually cost, independent of its outcome. Session-usage-limit
rejections (distinct from a genuinely broken task) exit with
RATE_LIMIT_EXIT_CODE and write a `rate_limit.json` sidecar next to the result
file with the reported reset time, which orchestrate.py uses to sleep and
retry without burning a real attempt. Keep RATE_LIMIT_EXIT_CODE in sync with
the same constant in orchestrate.py.
"""

import json
import subprocess
import sys
import time
from pathlib import Path

# When stdout/stderr are redirected to a file (as the runner does), Windows
# falls back to the console codepage (cp1252) instead of UTF-8, and a stray
# non-ASCII character in the agent's own text (e.g. "->") crashes this
# process mid-task with UnicodeEncodeError, wasting the whole attempt. Force
# line buffering too, so a tail -f on the redirected log sees output live
# instead of only once this process exits.
sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / ".orchestrator" / "schemas"
RATE_LIMIT_EXIT_CODE = 75

# Which result schema a task's agent must produce, keyed by task "type". The
# verifier is always a separate call made by orchestrate.py with type
# "verify" (never selected via a task's own "type" field) and must produce a
# verify-result, not a task-result, since it isn't reporting an implementation.
SCHEMA_FILE_BY_TYPE = {
    "feature": "task-result.schema.json",
    "research": "task-result.schema.json",
    "verify": "verify-result.schema.json",
}


def load_schema_for_cli(task_type: str) -> str:
    schema_path = SCHEMAS_DIR / SCHEMA_FILE_BY_TYPE.get(task_type, SCHEMA_FILE_BY_TYPE["feature"])
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    # claude --json-schema rejects a top-level $schema/title key ("no schema with key or ref ...").
    schema.pop("$schema", None)
    schema.pop("title", None)
    return json.dumps(schema)


def summarize(event: dict) -> str | None:  # noqa: C901 -- one branch per
    # stream-json event kind; not restructured as part of the orchestrate.py
    # refactor (see ORCHESTRATOR_GUIDE.md).
    """Human-readable one-liner for a stream-json event, or None to skip it."""
    kind = event.get("type")
    if kind == "assistant":
        for block in event.get("message", {}).get("content", []):
            if block.get("type") == "text" and block.get("text", "").strip():
                return f"[assistant] {block['text'].strip()}"
            if block.get("type") == "tool_use":
                name = block.get("name", "?")
                if name == "StructuredOutput":
                    return "[assistant] submitting final structured result"
                detail = json.dumps(block.get("input", {}))[:160]
                return f"[tool call] {name} {detail}"
        return None
    if kind == "user":
        for block in event.get("message", {}).get("content", []):
            if isinstance(block, dict) and block.get("type") == "tool_result":
                content = block.get("content", "")
                text = content if isinstance(content, str) else json.dumps(content)
                return f"[tool result] {text[:160]}"
        return None
    if kind == "rate_limit_event":
        info = event.get("rate_limit_info", {})
        return f"[rate limit] {info.get('rateLimitType')}: {info.get('status')}"
    if kind == "result":
        outcome = "error" if event.get("is_error") else "ok"
        cost = event.get("total_cost_usd", 0)
        return f"[done] outcome={outcome} turns={event.get('num_turns')} cost=${cost:.4f}"
    return None


# Tools to pre-authorize per task "type" — acceptEdits alone still prompts for
# Bash/WebSearch/WebFetch, which has no one to approve it headlessly and stalls
# the agent mid-task. Add a new type's tool needs here when you add a new
# prompt variant to PROMPT_FILES in orchestrate.py.
ALLOWED_TOOLS_BY_TYPE = {
    "feature": "Bash",
    "research": "Bash WebSearch WebFetch",
    "verify": "Bash",
}


def log_usage(result_file: str, final_event: dict, outcome_label: str, task_type: str) -> None:
    """Append one record to the milestone-level usage.jsonl, best-effort.

    task_type is "verify" for the independent verifier call and the task's
    own type (e.g. "feature") for the implementer -- both calls share the
    same task_id and attempt directory, so this is the only field that lets
    a later reader tell implementer cost apart from verifier cost. attempt
    is likewise pulled from the attempt-N directory name so retries of the
    same task_id can be told apart without cross-referencing state.json.
    """
    try:
        # result_file = .../runs/<milestone>/<task_id>/attempt-N/result.json
        attempt_dir = Path(result_file).parent
        task_id = attempt_dir.parent.name
        milestone_dir = attempt_dir.parent.parent
        usage = final_event.get("usage", {})
        model_usage = final_event.get("modelUsage", {})
        record = {
            "timestamp": time.time(),
            "task_id": task_id,
            "attempt": attempt_dir.name,
            "role": "verify" if task_type == "verify" else "implement",
            "task_type": task_type,
            "outcome": outcome_label,
            "total_cost_usd": final_event.get("total_cost_usd"),
            "num_turns": final_event.get("num_turns"),
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "cache_creation_input_tokens": usage.get("cache_creation_input_tokens"),
            "cache_read_input_tokens": usage.get("cache_read_input_tokens"),
            "model": next(iter(model_usage), ""),
            "session_id": final_event.get("session_id"),
        }
        with (milestone_dir / "usage.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")
    except OSError:
        pass


def main() -> int:  # noqa: C901 -- argv parsing, subprocess streaming, and
    # result-file writing in one linear sequence; not restructured as part
    # of the orchestrate.py refactor (see ORCHESTRATOR_GUIDE.md).
    if len(sys.argv) not in (2, 3, 4, 5):
        print("usage: run_claude_task.py <result_file> [model] [effort] [type]", file=sys.stderr)
        return 2
    result_file = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else ""
    effort = sys.argv[3] if len(sys.argv) > 3 else ""
    task_type = sys.argv[4] if len(sys.argv) > 4 else ""
    prompt = sys.stdin.read()

    command = [
        "claude",
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        ALLOWED_TOOLS_BY_TYPE.get(task_type, ALLOWED_TOOLS_BY_TYPE["feature"]),
        "--json-schema",
        load_schema_for_cli(task_type),
    ]
    if model:
        command += ["--model", model]
    if effort:
        command += ["--effort", effort]

    process = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    process.stdin.write(prompt)
    process.stdin.close()

    final_event: dict | None = None
    latest_rate_limit_info: dict = {}
    for line in process.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        summary = summarize(event)
        if summary:
            print(summary, flush=True)
        if event.get("type") == "rate_limit_event":
            latest_rate_limit_info = event.get("rate_limit_info", {})
        if event.get("type") == "result":
            final_event = event

    returncode = process.wait()
    stderr_text = process.stderr.read()

    if final_event is not None:
        is_rate_limited = (
            final_event.get("is_error") and latest_rate_limit_info.get("status") == "rejected"
        )
        log_usage(
            result_file,
            final_event,
            "rate_limited" if is_rate_limited else final_event.get("subtype", "unknown"),
            task_type,
        )
        if is_rate_limited:
            sidecar = {"resets_at": latest_rate_limit_info.get("resetsAt")}
            Path(result_file).parent.mkdir(parents=True, exist_ok=True)
            (Path(result_file).parent / "rate_limit.json").write_text(
                json.dumps(sidecar), encoding="utf-8"
            )
            print(
                f"[rate limit] session limit hit, resets_at={sidecar['resets_at']}", file=sys.stderr
            )
            return RATE_LIMIT_EXIT_CODE

    if returncode != 0:
        sys.stderr.write(stderr_text)
        return returncode

    if final_event is None:
        print("claude CLI stream ended without a final result event", file=sys.stderr)
        sys.stderr.write(stderr_text)
        return 1

    if final_event.get("is_error"):
        print(f"claude CLI reported an error: {final_event.get('result')}", file=sys.stderr)
        return 1

    structured_output = final_event.get("structured_output")
    if structured_output is None:
        print("claude CLI result event had no structured_output field", file=sys.stderr)
        print(json.dumps(final_event), file=sys.stderr)
        return 1

    with open(result_file, "w", encoding="utf-8") as handle:
        json.dump(structured_output, handle)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
