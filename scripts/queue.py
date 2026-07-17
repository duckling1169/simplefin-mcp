#!/usr/bin/env python3
"""Thin wrapper that walks a pre-approved queue of milestones overnight.

This deliberately does NOT fold milestone-selection into orchestrate.py.
orchestrate.py's contract stays exactly what it was designed and tested as:
"given one approved milestone staged into .orchestrator/milestone.json plus
.orchestrator/tasks/, execute it to completion or halt." This script only
decides which milestone gets staged next and whether to keep going — it never
picks a task, never judges a result, never touches git itself. All of that
stays inside orchestrate.py, unmodified in its blast radius by this wrapper.

Every milestone run overnight was already approved by a human before you went
to bed — see .orchestrator/queue.json and each .orchestrator/milestones/<id>/
milestone.json's "status": "approved". This script never approves anything and
never invents a next milestone; it just advances through what you already
signed off on, in the order you listed, and stops the instant anything isn't a
clean success.

Usage:
  python3 scripts/queue.py [--dry-run]

Exit code mirrors the point the queue stopped: 0 only if every milestone in
the queue completed cleanly; non-zero if any milestone halted, or the overall
wall-clock ceiling was reached before finishing the queue.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

ROOT = Path(__file__).resolve().parents[1]
ORCH = ROOT / ".orchestrator"
QUEUE_FILE = ORCH / "queue.json"
MILESTONES_DIR = ORCH / "milestones"
ACTIVE_MILESTONE_FILE = ORCH / "milestone.json"
ACTIVE_TASKS_DIR = ORCH / "tasks"
QUEUE_STATE_FILE = ORCH / "runs" / "queue-state.json"
ORCHESTRATE_SCRIPT = ROOT / "scripts" / "orchestrate.py"


class QueueError(RuntimeError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise QueueError(f"Missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise QueueError(f"Invalid JSON in {path}: {exc}") from exc


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def load_queue_state() -> dict[str, Any]:
    if QUEUE_STATE_FILE.exists():
        return load_json(QUEUE_STATE_FILE)
    return {"milestones": {}}


def stage_milestone(milestone_id: str) -> None:
    """Copy .orchestrator/milestones/<id>/{milestone.json,tasks/} into the
    active slot orchestrate.py reads (.orchestrator/milestone.json and
    .orchestrator/tasks/) — the same flat layout orchestrate.py has always
    used, just repopulated per milestone instead of hand-edited once.
    """
    source_dir = MILESTONES_DIR / milestone_id
    source_milestone = source_dir / "milestone.json"
    source_tasks_dir = source_dir / "tasks"
    if not source_milestone.exists():
        raise QueueError(f"Missing {source_milestone} for queued milestone {milestone_id!r}")
    if not source_tasks_dir.is_dir():
        raise QueueError(f"Missing {source_tasks_dir} for queued milestone {milestone_id!r}")

    shutil.copyfile(source_milestone, ACTIVE_MILESTONE_FILE)

    ACTIVE_TASKS_DIR.mkdir(parents=True, exist_ok=True)
    for existing in ACTIVE_TASKS_DIR.glob("*.json"):
        if ".example." not in existing.name:
            existing.unlink()
    task_files = sorted(p for p in source_tasks_dir.glob("*.json") if ".example." not in p.name)
    if not task_files:
        raise QueueError(f"No task JSON files found in {source_tasks_dir}")
    for task_file in task_files:
        shutil.copyfile(task_file, ACTIVE_TASKS_DIR / task_file.name)


def main() -> int:  # noqa: C901 -- one milestone at a time, in the order
    # queue.json lists, is a single linear loop by design; not restructured
    # as part of the orchestrate.py refactor (see ORCHESTRATOR_GUIDE.md).
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Pass through to orchestrate.py; stages the first not-yet-completed milestone "
        "and stops",
    )
    args = parser.parse_args()

    queue = load_json(QUEUE_FILE)
    milestone_ids = queue.get("milestones")
    if (
        not isinstance(milestone_ids, list)
        or not milestone_ids
        or not all(isinstance(m, str) for m in milestone_ids)
    ):
        raise QueueError(
            "queue.json 'milestones' must be a non-empty array of milestone id strings"
        )
    max_total_minutes = queue.get("max_total_minutes")
    if max_total_minutes is not None and not isinstance(max_total_minutes, (int, float)):
        raise QueueError("queue.json 'max_total_minutes' must be a number if present")

    state = load_queue_state()
    started = time.monotonic()

    for milestone_id in milestone_ids:
        record = state["milestones"].setdefault(milestone_id, {})
        if record.get("status") == "completed":
            print(f"Skipping {milestone_id}: already completed in a prior queue run")
            continue

        if max_total_minutes is not None:
            elapsed_minutes = (time.monotonic() - started) / 60
            if elapsed_minutes >= max_total_minutes:
                print(
                    f"Stopping queue: max_total_minutes ({max_total_minutes}) reached "
                    f"before starting {milestone_id}",
                    file=sys.stderr,
                )
                write_json(QUEUE_STATE_FILE, state)
                return 2

        print(f"=== Staging milestone {milestone_id} ===")
        try:
            stage_milestone(milestone_id)
        except QueueError as exc:
            record.update({"status": "halted", "reason": str(exc)})
            write_json(QUEUE_STATE_FILE, state)
            print(f"Stopping queue: {exc}", file=sys.stderr)
            return 2

        command = [sys.executable, str(ORCHESTRATE_SCRIPT)]
        if args.dry_run:
            command.append("--dry-run")

        print(f"=== Running orchestrate.py for {milestone_id} ===")
        result = subprocess.run(command, cwd=ROOT, check=False)

        if args.dry_run:
            print(f"Dry run: stopping after previewing {milestone_id}")
            return result.returncode

        if result.returncode != 0:
            record.update({"status": "halted", "exit_code": result.returncode})
            write_json(QUEUE_STATE_FILE, state)
            print(
                f"Stopping queue: {milestone_id} did not complete cleanly "
                f"(exit {result.returncode}); see .orchestrator/runs/{milestone_id}/state.json "
                "for the reason",
                file=sys.stderr,
            )
            return 2

        record.update({"status": "completed"})
        write_json(QUEUE_STATE_FILE, state)
        print(f"=== Milestone {milestone_id} complete; advancing to the next queued milestone ===")

    print("Queue complete: every milestone finished cleanly.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except QueueError as exc:
        print(f"queue error: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
