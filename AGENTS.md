# AGENTS.md — Harness Repo Agent Guide

Instructions for AI agents working in **agentic-product-development-harness**. Read this before making changes.

## What this repo is

v0.1 documentation scaffold for a Cursor-first agentic product development harness. It contains docs, templates, and eval contracts—not production automation, skills, or implementation code.

The harness is entering a **Cursor Automations trigger spike** phase. Linear statuses/labels are configured manually; automations are planned, not live.

## Core rules

1. **Keep changes narrow.** Match the scope of the issue or plan. Do not expand into implementation code, skills, or automations unless explicitly requested and aligned with ROADMAP phase.

2. **Do not invent maturity.** Label everything as **implemented** (exists in repo today) vs **planned** (future phase). Never imply Linear automations, cloud agents, or skills are live when they are not.

3. **Prefer docs and templates before code.** If a workflow is new, add or refine templates and ADRs first. Code and skills come after manual validation.

4. **Do not create skills until a repeated workflow is validated across multiple runs.** See [`skills/README.md`](skills/README.md). Skills encode proven manual loops—not guesses.

5. **Update ROADMAP and ARCHITECTURE when changing scope.** If you add a component, phase, or platform assumption, reflect it in both files.

6. **Report validation clearly.** State what was checked, what passed, what was not run, and what requires human review.

7. **Never touch other local repos unless explicitly instructed.** Target repos (e.g. `weston-uribe-portfolio`) are separate workspaces. This repo defines the harness; it does not modify portfolio, kinterra, or other codebases by default.

## Cursor model policy

- Every Cursor agent, cloud agent, or automation in this harness must use the Cursor model setting **`Auto` only**.
- Do **not** configure or recommend named models (Composer, GPT-5.5, Claude, or any explicit model).
- If an automation cannot be configured with `Auto`, do not create it yet.
- Mention the model setting used in reports when relevant.

## Automation and Linear behavior (planned spike)

When working on or simulating harness automations:

- **Exit early** if triggered on an unsupported Linear status — no branch, PR, or status writes.
- **Do not advance Linear status** unless the required durable artifact exists (plan comment, PR link, revision summary, etc.).
- **Preserve state in Linear/GitHub artifacts** — comments, PRs, commits, preview URLs — not hidden session memory.
- **Do not rely on hidden session memory** as source of truth; a fresh agent must reconstruct context from durable artifacts.
- **Planning is optional** — respect `requires-plan` and `skip-plan` labels per [`docs/architecture/linear-automation-state-machine.md`](docs/architecture/linear-automation-state-machine.md).
- **Plan Review is deprecated** in the default workflow — do not route work to it.

## Agent reporting contract

Cursor agents working in or through this harness should report **concise, factual** status—not strategic recommendations.

**Include in every run report:**

- **Objective evidence** — links, command output, screenshots, diff summaries, preview URLs
- **Completed actions** — what was actually done (files edited, commands run, PR opened)
- **Validation results** — pass / fail / not run per check, with evidence
- **Blockers** — anything that stopped or limited progress
- **Changed files** — explicit list of paths touched
- **Model setting** — confirm `Auto` was used when relevant

**Do not include unless explicitly asked:**

- Strategic next steps or sequencing recommendations
- Roadmap phase suggestions
- "You should do X next" product or process advice

**Strategic sequencing is owned by the human operator / ChatGPT planning partner.** Agents execute scoped work and report facts; they do not own what comes after the current task.

## Releases, tags, PRs, and commits

These are distinct artifacts. Do not conflate them in docs or reports.

| Artifact | What it is | When to create |
|----------|------------|----------------|
| **Commit** | A saved change in git history | After completing a scoped unit of work |
| **PR** | A reviewable proposal to merge a branch | When code is ready for human review |
| **Tag** | A named pointer to a specific commit | When marking a version milestone |
| **Release** | A published, externally useful milestone (often tied to a tag) | Only when the milestone is externally useful **and** explicitly approved |

**Never create releases** unless the milestone is externally useful and explicitly approved by the human operator. Internal harness improvements and spike work do not need releases.

## Before acting

1. Read [`docs/decisions/0001-cursor-first-v0.1.md`](docs/decisions/0001-cursor-first-v0.1.md) for v0.1 constraints
2. Read [`docs/decisions/0003-automation-state-machine-and-auto-model-policy.md`](docs/decisions/0003-automation-state-machine-and-auto-model-policy.md) for state machine and model policy
3. Check [`ROADMAP.md`](ROADMAP.md) for current phase boundaries
4. Use templates in [`templates/`](templates/) for issue, plan, readiness, and eval artifacts

## What not to do

- Claim production-ready automation exists
- Add Cursor skills, automations, or MCP servers without explicit approval
- Build a UI or control plane in v0.1
- Autonomously ship software or merge PRs without human gates
- Overstate eval automation (v0.1 evals are human-readable rubrics)
- Recommend strategic next steps unless the operator explicitly asks
- Create skills after a single run
- Create releases without explicit approval and external usefulness
- Configure named Cursor models

## File map

```text
README.md           → Public overview and honest v0.1 positioning
ROADMAP.md          → Phased delivery plan
ARCHITECTURE.md     → Modular component model
AGENTS.md           → This file
docs/architecture/  → Linear automation state machine
docs/decisions/     → Architecture decision records
docs/research/      → Workflow research notes
templates/          → Issue, plan, readiness, eval templates
evals/              → Eval rubric contracts (manual first)
skills/             → Deferred until workflows are validated
examples/           → Example runs (portfolio first)
```

## Tone

Write for hiring managers and technical reviewers: clear, honest, structured. Early-stage is a feature—do not dress v0.1 up as v1.0.
