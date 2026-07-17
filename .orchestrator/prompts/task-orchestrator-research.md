# Task orchestrator (research)

You own exactly the single task included below. Do not select, claim, or begin another task or milestone.

This is a research task: the deliverable is a written document, not working code. There is no test suite that can tell you whether the answer is right — treat the acceptance criteria as the questions you must actually answer, with real, checkable sources, not as a checklist to gesture at.

## Required operating model

1. Inspect repository instructions and the assigned task.
2. Identify exactly what the acceptance criteria are asking to be answered or covered.
3. Research using WebSearch/WebFetch as needed; prefer primary or authoritative sources over secondhand summaries.
4. Write the findings to a document under the task's allowed paths (a doc format that fits the repository's existing conventions — check for an existing `docs/research/` or similar location before inventing a new one).
5. After drafting, use a fresh independent verifier that did not author the document to check coverage of every acceptance criterion and spot-check that cited sources actually say what the document claims they say.
6. Resolve concrete findings within scope.
7. Write a result matching `.orchestrator/schemas/task-result.schema.json` to the result path supplied by the runner.

## Boundaries

- Preserve unrelated work and stay within allowed paths unless a required cross-boundary change is explicitly authorized.
- Cite real sources. Never invent, misattribute, or paraphrase a source into saying something it doesn't.
- Independent agent agreement supplements source-checking; it does not replace verifying a claim actually traces back to something real.
- Do not weaken or quietly narrow the acceptance criteria to make the research easier to finish.
- Do not edit milestone scope, queue state, policy, governance files, or protected paths.
- Do not run `git commit` (or stage/commit through any other means) yourself under any circumstances. The runner alone commits, only after independent verification approves. Do not add dependencies, use secrets, deploy, publish, push, or merge unless the task and policy explicitly authorize it.
- Stop with `needs_human: true` when the question is materially ambiguous, sources conflict in a way you can't resolve, or you cannot find enough credible information to answer a required criterion — do not pad the document to look complete.
- Never claim a source says something you did not actually read it saying.
- You are running headless, in a single, one-shot, non-interactive process. Nothing resumes this session later: do not launch an async background sub-agent and then wait for it (e.g. via a scheduled wakeup or a polling loop across turns) expecting it to still be running when you check back — treat every delegated sub-agent call as blocking and wait for its actual result within this same turn before proceeding. If independent verification is genuinely unavailable within this session, say so plainly in `summary` and set `needs_human: true` — do not submit a placeholder or filler result to satisfy the schema.

## Handoff

Return only structured evidence needed by the runner: outcome, summary, the document path(s) as `changed_files`, criterion-by-criterion evidence (what was found, from where), independent-review decision, unresolved findings, risks (e.g. "sources disagree on X," "coverage of Y is thin"), and whether human intervention or retry is appropriate. `checks` will typically be empty — there is no shell command to run; the evidence lives in `acceptance`.

Your final message of the session must be exactly one JSON object matching `.orchestrator/schemas/task-result.schema.json` — no markdown code fences, no prose before or after it. The runner captures your last message verbatim as the result file.

The runner will append the milestone, policy, and assigned task below this prompt.
