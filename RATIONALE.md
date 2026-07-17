# Research rationale: token-efficient repository guidance

Updated 2026-07-14. This memo distinguishes direct evidence from product documentation and design inference.

## Recommendation

Use one small, human-maintained root `AGENTS.md` as the canonical set of non-inferable operating requirements. For Claude Code, add a one-line `CLAUDE.md` containing `@AGENTS.md`; this is Anthropic's documented interoperability pattern. Keep ordinary project documents canonical and tell the agent when—not always—to read them. Begin with no nested files; introduce path-scoped rules only after a measured recurring need.

The important design is not the filename. It is selective context: always load only commands, costly invariants, and a compact reading policy; retrieve architecture, contribution, backlog, and roadmap detail only when the task calls for it.

## What the evidence says

### 1. More repository context is not automatically better — high confidence

Gloaguen et al. evaluated Claude Code, Codex, and Qwen Code on SWE-bench Lite plus 138 tasks from 12 repositories. Their current revision reports that context files did not generally improve success and increased inference cost by more than 20% on average. Detailed experiments found generated files reduced performance in most settings; both generated and developer-written files increased exploration and reasoning. The authors conclude that context files are useful for nonstandard practices but should contain only minimal requirements. This is the closest direct evidence to the question, though it uses one run per configuration and a limited task/repository sample.

A smaller Codex-only paired study of 124 pull requests reported 16.6% lower median output tokens and 28.6% lower median runtime with `AGENTS.md`. However, it did not functionally evaluate patch correctness; its manual check only ruled out obviously trivial output. Treat this as evidence that useful instructions can reduce expensive outlier runs, not proof that any `AGENTS.md` improves outcome-per-token.

Together these findings support testing a minimal, curated file against no file—not generating a comprehensive repository handbook.

### 2. Relevance and retrieval matter more than raw context volume — medium/high confidence

Long-context work repeatedly finds that models do not use all positions equally; “lost in the middle” performance degrades when relevant information is buried. Repository-level research is nuanced: RepoExec found full dependency context can help generation when that context is relevant, while Repoformer showed selective retrieval could improve accuracy and reduce latency. The practical synthesis is not “always less context”; it is “pay for relevant context and avoid unconditional distractors.”

That is why this kit keeps durable facts in ordinary documents but supplies a task-conditioned reading map rather than importing every document at startup.

### 3. Product loaders concatenate instructions, so hierarchy has a real recurring cost — high confidence for documented behavior

- Codex loads at most one instruction file per directory from repository root to the working directory, concatenates them, and defaults to a 32 KiB combined limit. Closer files appear later and can override broader guidance.
- Claude Code loads ancestor `CLAUDE.md` files in full and discovers descendant files when it reads in those directories. Anthropic warns that longer files reduce adherence, that imports still consume launch context, and that files over 200 lines may reduce adherence.
- Gemini CLI concatenates global, workspace, and just-in-time hierarchical context and sends loaded context with prompts.
- GitHub Copilot supports repository-wide, path-specific, and nearest-`AGENTS.md` agent instructions; its surfaces differ in which formats they honor.
- Cursor supports `AGENTS.md` as well as project rules, while Aider warns that irrelevant files raise token cost and distraction and instead builds a budgeted repository map.

Therefore nested instruction files are an optimization only when their loaders are genuinely on-demand or when local rules replace costly ambiguity. A hierarchy created merely for organization can still add prompt tokens.

## Information architecture

| Artifact | Contains | Excludes | Load policy |
|---|---|---|---|
| `AGENTS.md` | exact commands, non-inferable invariants, verification and reading policy | directory tour, dependency list, tutorials, generic style | every task |
| `CLAUDE.md` | `@AGENTS.md` adapter only | duplicated rules | every Claude Code task |
| `README.md` | purpose, quick start, normal use | agent behavior | when orienting/setup is needed |
| `ARCHITECTURE.md` | boundaries, costly flows, contracts, decisions | file-by-file inventory | boundary/cross-component work |
| `CONTRIBUTING.md` | development, verification matrix, release workflow | architecture prose | workflow/dependency/release work |
| `BACKLOG.md` | short ordered next actions and blockers | completed history, speculative ideas | planning/resumption |
| `ROADMAP.md` | optional longer-term outcomes | task checklist | direction-dependent work |
| Git history | completed changes and their rationale | future work | historical investigation |

This separation reduces duplication. The router names a document and its trigger but does not summarize the document, because summaries drift and still consume always-loaded context.

## Budget and maintenance

No literature establishes a universal optimal byte/token limit. Codex's 32 KiB ceiling and Claude's 200-line warning are implementation limits, not targets. Based on the direct evidence favoring minimal nonstandard requirements, the kit targets roughly 250–600 tokens and warns at 4,000 bytes/80 lines; this is an evidence-informed operating range, not an experimentally established threshold. Calibrate through the included benchmark because tokenizers, prompt caching, agent loops, and project complexity make a universal count misleading.

Review instructions when an agent repeats a costly mistake, when commands/contracts change, and on agent upgrades. Add a rule only after the selection test in `TEMPLATE_GUIDE.md`. Delete facts now enforced by tests, linters, schemas, or hooks. Automation should enforce deterministic requirements; natural-language reminders are probabilistic.

Bounded document maintenance is part of task completion: change architecture only when boundaries/contracts change, keep backlog near-term and remove finished work, and never let an agent invent roadmap commitments. Git history remains the completed-work record.

## Rejected patterns

- **Generated comprehensive context file:** direct evidence indicates higher cost and slightly worse success.
- **Repository overview/directory tree in always-loaded instructions:** quickly stale, usually inferable, and not shown to localize relevant files effectively.
- **Importing README/architecture wholesale:** easier organization, same context bill.
- **Duplicated `AGENTS.md` and `CLAUDE.md`:** drift and conflict; use the documented import adapter.
- **Nested file in every directory:** repeated discovery and concatenation without demonstrated task value.
- **Generic exhortations** such as “write clean code”: unverifiable and already represented in model/tool defaults.
- **Changelog as a second feature ledger:** use Git history unless release consumers require curated notes.
- **Optimizing tokens alone:** a cheap failed patch is not efficient; measure cost per successful task.

## Sources

### Research

- Gloaguen et al., [Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?](https://arxiv.org/abs/2602.11988), 2026.
- Lulla et al., [On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents](https://arxiv.org/abs/2601.20404), 2026.
- Liu et al., [Lost in the Middle: How Language Models Use Long Contexts](https://aclanthology.org/2024.tacl-1.9/), TACL 2024.
- Le-Cong et al., [On the Impacts of Contexts on Repository-Level Code Generation](https://aclanthology.org/2025.findings-naacl.82/), NAACL Findings 2025.
- Wu et al., [Repoformer: Selective Retrieval for Repository-Level Code Completion](https://arxiv.org/abs/2403.10059), 2024.
- Jimenez et al., [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://openreview.net/forum?id=VTF8yNQM66), ICLR 2024.

### Official behavior documentation

- OpenAI, [Custom instructions with AGENTS.md](https://developers.openai.com/codex/agent-configuration/agents-md).
- Anthropic, [How Claude remembers your project](https://code.claude.com/docs/en/memory).
- GitHub, [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions).
- Google, [Provide context with GEMINI.md files](https://geminicli.com/docs/cli/gemini-md/).
- Cursor, [Rules](https://cursor.com/docs/rules).
- Aider, [Repository map](https://aider.chat/docs/repomap.html) and [FAQ](https://aider.chat/docs/faq.html).
- [AGENTS.md open format](https://agents.md/).
