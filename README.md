# Agentic Product Development Harness

**Status: Milestone 9 — ChatGPT issue intake prompt**

This project explores how an AI-native PM can define product work in structured issues, guide AI-assisted implementation through Cursor, and evaluate outputs before human product and engineering review.

## What this is

A Cursor-first harness for turning product issues into implementation plans, validation reports, and review-ready pull requests. M1–M7 SDK runners handle planning through merge; **M8 adds automatic cloud runs** when Linear status changes; **M9 adds a canonical ChatGPT intake prompt** so PMs can draft harness-compatible Linear issues by copy-pasting into a normal chat thread.

The architecture is modular: **Cursor + GitHub + Linear + Vercel previews + human review**, with a Vercel webhook bridge and GitHub Actions auto-runner.

## Why it exists

AI-assisted development makes it easy to generate code quickly. It does not, by itself, make product judgment, scope control, or review readiness visible. This harness structures the work so that:

- Product intent is captured before implementation
- AI execution happens in a bounded, reviewable context
- Outputs are evaluated against explicit criteria before humans sign off

## Current capability

| Layer | Status |
|-------|--------|
| Issue intake | ChatGPT copy-paste prompt + Cursor skill + validate-issue CLI |
| Planning / implementation / handoff / revision / merge | SDK runners (M1–M6) |
| **Auto-run from Linear status** | **Webhook bridge + GitHub Actions (M8)** |
| Human approval | Required at merge |
| Reusable skills beyond issue intake | Deferred |

## Auto-run flow (M8)

```text
Linear status → Ready for Planning / Ready for Build / PR Open / Needs Revision / Ready to Merge
  → Vercel webhook → GitHub Actions → harness run --phase auto
```

Setup: [`docs/linear-watcher-setup.md`](docs/linear-watcher-setup.md)

## Workflow

```text
Structured issue → Implementation plan → Cursor execution
  → Eval scorecard → PR readiness report → Human review → PR / preview
```

Each step has a template in [`templates/`](templates/). Status changes on allowlisted Linear statuses trigger harness phases automatically; human gates remain at review and merge.

## What exists today

- SDK harness runners M1–M7 — see [`ROADMAP.md`](ROADMAP.md)
- **M8:** [`api/linear-webhook.ts`](api/linear-webhook.ts), [`.github/workflows/harness-auto-runner.yml`](.github/workflows/harness-auto-runner.yml)
- **M9:** ChatGPT intake prompt — [`prompts/issue-intake-chatgpt.md`](prompts/issue-intake-chatgpt.md)
- Issue intake skill — [`skills/issue-intake/`](skills/issue-intake/)
- Templates, evals, examples, architecture docs

## What is planned

See [`ROADMAP.md`](ROADMAP.md) for deferred work: lead agent, additional skills, release automation.

## First target repo

The first real-world target for this harness is [`weston-uribe/weston-uribe-portfolio`](https://github.com/weston-uribe/weston-uribe-portfolio)—a modular Next.js portfolio used for case studies and AI-assisted product prototyping.

## What this repo does not claim

- Autonomous shipping without human review
- Lead agent or planner/implementer skills
- Production release tags
- Polling-based Linear watcher

Issue intake is implemented via [`prompts/issue-intake-chatgpt.md`](prompts/issue-intake-chatgpt.md) (ChatGPT) and [`skills/issue-intake/`](skills/issue-intake/) (Cursor). Additional skills remain deferred.

## Getting started

1. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the modular component model
2. Read [`AGENTS.md`](AGENTS.md) if you are an AI agent working in this repo
3. **PM intake:** copy [`prompts/issue-intake-chatgpt.md`](prompts/issue-intake-chatgpt.md) into ChatGPT — or use [`skills/issue-intake/SKILL.md`](skills/issue-intake/SKILL.md) in Cursor
4. Validate: `npm run harness:validate-issue -- --file draft.md --intended-phase planning`
5. Dry-run: `npm run harness:run -- --issue WES-XX --dry-run`
6. **Auto-run setup:** [`docs/linear-watcher-setup.md`](docs/linear-watcher-setup.md)

## License

MIT — see [`LICENSE`](LICENSE).
