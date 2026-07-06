# AGENTS.md — Harness Repo Agent Guide

Instructions for AI agents working in **agentic-product-development-harness**. Read this before making changes.

## What this repo is

v0.1 documentation scaffold for a Cursor-first agentic product development harness. It contains docs, templates, and eval contracts—not production automation, skills, or implementation code.

## Core rules

1. **Keep changes narrow.** Match the scope of the issue or plan. Do not expand into implementation code, skills, or automations unless explicitly requested and aligned with ROADMAP phase.

2. **Do not invent maturity.** Label everything as **implemented** (exists in repo today) vs **planned** (future phase). Never imply Linear, cloud agents, or skills are live when they are not.

3. **Prefer docs and templates before code.** If a workflow is new, add or refine templates and ADRs first. Code and skills come after manual validation.

4. **Do not create skills until a repeated workflow is validated.** See [`skills/README.md`](skills/README.md). Skills encode proven manual loops—not guesses.

5. **Update ROADMAP and ARCHITECTURE when changing scope.** If you add a component, phase, or platform assumption, reflect it in both files.

6. **Report validation clearly.** State what was checked, what passed, what was not run, and what requires human review.

7. **Never touch other local repos unless explicitly instructed.** Target repos (e.g. `weston-uribe-portfolio`) are separate workspaces. This repo defines the harness; it does not modify portfolio, kinterra, or other codebases by default.

## Before acting

1. Read [`docs/decisions/0001-cursor-first-v0.1.md`](docs/decisions/0001-cursor-first-v0.1.md) for v0.1 constraints
2. Check [`ROADMAP.md`](ROADMAP.md) for current phase boundaries
3. Use templates in [`templates/`](templates/) for issue, plan, readiness, and eval artifacts

## What not to do

- Claim production-ready automation exists
- Add Cursor skills, automations, or MCP servers without explicit approval
- Build a UI or control plane in v0.1
- Autonomously ship software or merge PRs without human gates
- Overstate eval automation (v0.1 evals are human-readable rubrics)

## File map

```text
README.md           → Public overview and honest v0.1 positioning
ROADMAP.md          → Phased delivery plan
ARCHITECTURE.md     → Modular component model
AGENTS.md           → This file
docs/decisions/     → Architecture decision records
docs/research/      → Workflow research notes
templates/          → Issue, plan, readiness, eval templates
evals/              → Eval rubric contracts (manual first)
skills/             → Deferred until workflows are validated
examples/           → Future example runs (portfolio first)
```

## Tone

Write for hiring managers and technical reviewers: clear, honest, structured. Early-stage is a feature—do not dress v0.1 up as v1.0.
