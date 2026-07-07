# Agentic Product Development Harness

**Status: v0.1 — documentation scaffold**

This project explores how an AI-native PM can define product work in structured issues, guide AI-assisted implementation through Cursor, and evaluate outputs before human product and engineering review.

## What this is

A Cursor-first harness for turning product issues into implementation plans, validation reports, and review-ready pull requests. v0.1 is intentionally a **manual loop**: docs, templates, and eval contracts—not automation.

The architecture is modular so the harness can evolve beyond Cursor later. v0.1 is explicitly designed around a current workflow: **Cursor + GitHub + Linear-style issues + Vercel previews + human review**.

## Why it exists

AI-assisted development makes it easy to generate code quickly. It does not, by itself, make product judgment, scope control, or review readiness visible. This harness structures the work so that:

- Product intent is captured before implementation
- AI execution happens in a bounded, reviewable context
- Outputs are evaluated against explicit criteria before humans sign off

The goal is to prove one reliable loop manually before wiring automation, cloud agents, or reusable skills.

## v0.1 constraint

v0.1 is **Cursor-specific** but **modular by design**:

| Layer | v0.1 status |
|-------|-------------|
| Issue intake | Skill + validate-issue CLI |
| Implementation planning | Manual (templates) |
| Execution | Cursor (local agent) |
| Validation / evals | Manual rubrics |
| Readiness reporting | Manual (templates) |
| Human approval | Required at every merge |
| Linear integration | Planned |
| GitHub PR workflow | Planned |
| Vercel preview review | Planned |
| Cloud agents | Planned |
| Reusable skills | Deferred |

## Workflow (designed, not automated)

```text
Structured issue → Implementation plan → Cursor execution
  → Eval scorecard → PR readiness report → Human review → PR / preview
```

Each step has a template in [`templates/`](templates/). v0.1 expects a human PM to drive the loop and an AI agent in Cursor to execute scoped implementation work.

## What exists today

- [`README.md`](README.md), [`ROADMAP.md`](ROADMAP.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`AGENTS.md`](AGENTS.md)
- Architecture decision record: [`docs/decisions/0001-cursor-first-v0.1.md`](docs/decisions/0001-cursor-first-v0.1.md)
- Issue, plan, readiness, and eval templates in [`templates/`](templates/)
- Placeholder directories for [`evals/`](evals/), [`skills/`](skills/), and [`examples/`](examples/)

## What is planned

See [`ROADMAP.md`](ROADMAP.md) for phased delivery from manual Cursor loop (v0.1) through eval contracts, Linear control plane, PR/preview workflow, cloud agent experiments, and v1.0 reusable sprint harness.

## First target repo

The first real-world target for this harness is [`weston-uribe/weston-uribe-portfolio`](https://github.com/weston-uribe/weston-uribe-portfolio)—a modular Next.js portfolio used for case studies and AI-assisted product prototyping.

## What this repo does not claim

- Production-ready automation already exists
- Cloud agents are wired and running
- Linear integration is implemented
- Reusable Cursor skills beyond issue intake
- The system can autonomously ship software without human review

Issue intake is implemented via [`skills/issue-intake/`](skills/issue-intake/). Additional skills remain deferred.

## Getting started

1. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the modular component model
2. Read [`AGENTS.md`](AGENTS.md) if you are an AI agent working in this repo
3. Use [`skills/issue-intake/SKILL.md`](skills/issue-intake/SKILL.md) or [`templates/linear-issue.md`](templates/linear-issue.md) to draft a product issue
4. Validate before Linear paste: `npm run harness:validate-issue -- --file draft.md --intended-phase planning`
5. Run the harness against a Linear issue: `npm run harness:run -- --issue WES-XX --dry-run`

## License

MIT — see [`LICENSE`](LICENSE).
