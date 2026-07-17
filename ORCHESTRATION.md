# Orchestrated milestone execution

This file is the durable source of truth for execution that begins after a maintainer approves `.orchestrator/milestone.json`. Normal contribution workflow remains in `CONTRIBUTING.md`.

## Ownership

- The maintainer owns product purpose, milestone approval, authority exceptions, and acceptance of escalated decisions.
- The outer runner owns task selection, dependency order, attempts, durable run state, and milestone termination.
- A task orchestrator owns exactly one assigned task and may delegate bounded implementation and independent verification.
- Subagents do not claim tasks, edit queue state, approve later milestones, or change orchestration policy.

## Completion

A task is complete only when:

- its observable acceptance criteria have evidence;
- required deterministic checks pass — re-run by the runner itself, not trusted from any agent's self-report (`execution.enforce_hard_gate` in `policy.json`);
- it touched no protected path — checked by the runner against the actual diff, not trusted from any agent's self-report (`execution.enforce_protected_paths` in `policy.json`);
- a verifier that did not author the implementation approves it;
- no unresolved finding or protected-boundary exception remains;
- the result matches the repository's structured result contract.

Agent consensus is not a substitute for tests, static checks, builds, acceptance scripts, or CI.

## Escalation

Stop the milestone and request maintainer judgment when product intent is materially ambiguous, a task requires excluded scope or a protected path, required access is unavailable, attempts reach policy limits, evidence conflicts, or a high-consequence change lacks explicit authority.

A completed task authorizes the runner to consider the next eligible task in the same approved milestone. It never authorizes a new milestone — including when `scripts/queue.py` is walking a pre-approved list of several milestones unattended (see `ORCHESTRATOR_GUIDE.md`): every milestone it advances into was already `"approved"` by the maintainer before the run started.

## Integration

Use the integration strategy in `.orchestrator/policy.json`. The reference runner's default (`vcs.stage_all`/`vcs.commit`/`vcs.push` configured) commits and pushes directly to the current branch — never a protected branch (`integration.protected_branch`, e.g. `main`) — automatically, but only after both the runner's own deterministic hard gate and an independent verifier's `"approve"` have passed; the agent process exiting successfully is never, on its own, sufficient (see `ORCHESTRATOR_GUIDE.md`'s "Who commits, and when"). Leave `vcs.stage_all`/`vcs.commit` unset in `policy.json` to fall back to the more conservative local-branch/PR/human-merge model instead.

Generated files under `.orchestrator/runs/` are execution evidence. They are not a product roadmap, completed-work ledger, or replacement for Git history and pull requests.