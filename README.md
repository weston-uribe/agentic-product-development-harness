# Agentic Product Development Harness

**Current release: v0.2.0** (GitHub source release — see [`docs/releases/v0.2.0.md`](docs/releases/v0.2.0.md))

This is a **Cursor-first harness** for **Linear + GitHub + GitHub Actions**. **Cursor is the only implemented agent provider today.** It explores how an AI-native PM can define product work in structured issues, guide AI-assisted implementation through Cursor, and evaluate outputs before human product and engineering review.

## What this is

A Cursor-first harness for turning product issues into implementation plans, validation reports, and review-ready pull requests. SDK runners handle planning through merge and production sync; automatic cloud runs are triggered when Linear status changes; a canonical ChatGPT intake prompt lets PMs draft harness-compatible Linear issues by copy-pasting into a normal chat thread.

The architecture is modular by subsystem — **Cursor + GitHub + Linear + Vercel previews + human review**, with a Vercel webhook bridge and GitHub Actions auto-runner — but it is **not provider-agnostic yet**. See the [configuration and portability posture](#configuration-and-portability-posture) below.

## Quick links

| Topic | Doc |
|-------|-----|
| Getting started | [`docs/getting-started.md`](docs/getting-started.md) |
| Release contract (v0.2.0) | [`docs/releases/v0.2.0.md`](docs/releases/v0.2.0.md) |
| Security baseline | [`docs/security.md`](docs/security.md) |
| Provider portability | [`docs/provider-portability.md`](docs/provider-portability.md) |
| Linear watcher setup | [`docs/linear-watcher-setup.md`](docs/linear-watcher-setup.md) |

## Why it exists

AI-assisted development makes it easy to generate code quickly. It does not, by itself, make product judgment, scope control, or review readiness visible. This harness structures the work so that:

- Product intent is captured before implementation
- AI execution happens in a bounded, reviewable context
- Outputs are evaluated against explicit criteria before humans sign off

## Current capability

| Layer | Status |
|-------|--------|
| Issue intake | ChatGPT copy-paste prompt + Cursor skill + validate-issue CLI |
| Planning / implementation / handoff / revision / merge | SDK runners (implemented) |
| Production sync | SDK runner + optional `production_promoted` dispatch (implemented) |
| Auto-run from Linear status | Webhook bridge + GitHub Actions (implemented) |
| Agent provider | Cursor Cloud Agents only (implemented) |
| Linear / status gates | Required — automation respects allowlisted statuses |
| GitHub required review (solo repo) | **0 approvals** — PR + required checks only |
| Reusable skills beyond issue intake | Deferred |

## Auto-run flow

```text
Linear status → Ready for Planning / Ready for Build / PR Open / Needs Revision / Ready to Merge
  → Vercel webhook → GitHub Actions → harness run --phase auto
```

Setup: [`docs/linear-watcher-setup.md`](docs/linear-watcher-setup.md) — Security baseline: [`docs/security.md`](docs/security.md)

## Workflow

```text
Structured issue → Implementation plan → Cursor execution
  → Eval scorecard → PR readiness report → Human review → PR / preview
```

Each step has a template in [`templates/`](templates/). Status changes on allowlisted Linear statuses trigger harness phases automatically; **Linear/status gates** remain at review and merge. GitHub required review is disabled (0 approvals) in solo-maintainer mode — see [`docs/security.md`](docs/security.md).

## What exists today

- SDK harness runners for planning, implementation, handoff, revision, merge, and production sync — see [`ROADMAP.md`](ROADMAP.md)
- Event-driven auto-runner — [`api/linear-webhook.ts`](api/linear-webhook.ts), [`.github/workflows/harness-auto-runner.yml`](.github/workflows/harness-auto-runner.yml)
- ChatGPT intake prompt — [`prompts/issue-intake-chatgpt.md`](prompts/issue-intake-chatgpt.md)
- Issue intake skill — [`skills/issue-intake/`](skills/issue-intake/)
- Cursor Cloud Agents as the single implemented agent provider
- Templates, evals, examples, architecture docs

## Configuration and portability posture

V0.2 is **Cursor-first** and **not provider-agnostic yet**. Cursor is the only implemented agent execution provider, Linear and GitHub are explicit assumptions, GitHub Actions is the cloud runner, and Vercel is the only implemented preview provider when preview capture is enabled. Config exposes an `agentProvider` shape with `id: "cursor"` only; `defaultModel` remains for backward compatibility.

- What is configurable, fixed, and intentionally not claimed: [`docs/provider-portability.md`](docs/provider-portability.md)
- Why the agent provider is not a simple model/env-var swap: [`docs/decisions/0004-agent-provider-boundary.md`](docs/decisions/0004-agent-provider-boundary.md)

This repo does **not** claim provider agnosticism, or support for Claude Code, Codex, local VS Code agents, GitLab, or Bitbucket.

## What is planned

See [`ROADMAP.md`](ROADMAP.md) for deferred work: additional skills, automated eval contract, and future portability.

## First target repo

The first real-world target for this harness is [`weston-uribe/weston-uribe-portfolio`](https://github.com/weston-uribe/weston-uribe-portfolio)—a modular Next.js portfolio used for case studies and AI-assisted product prototyping.

**Branch strategy (portfolio):** harness issue PRs target and merge into **`dev`**. Linear status **`Merged to Dev`** means integrated on the dev branch but **not yet in production**. Production remains **`main`** at [`weston-uribe-portfolio.vercel.app`](https://weston-uribe-portfolio.vercel.app). After manually promoting **`dev` → `main`**, run **`npm run harness:sync-production -- --repo portfolio`**. Setup: [`docs/target-repo-branch-setup.md`](docs/target-repo-branch-setup.md).

## What this repo does not claim

- Autonomous shipping without Linear/status gates
- Production-grade robustness or portability
- Provider agnosticism (Cursor is the only implemented agent provider)
- Lead agent or planner/implementer skills
- npm package publication
- Polling-based Linear watcher

Git tags and GitHub releases are operator-controlled milestones — see [`docs/releases/release-process.md`](docs/releases/release-process.md). They are not created from doc PRs.

Issue intake is implemented via [`prompts/issue-intake-chatgpt.md`](prompts/issue-intake-chatgpt.md) (ChatGPT) and [`skills/issue-intake/`](skills/issue-intake/) (Cursor). Additional skills remain deferred.

## Getting started

See [`docs/getting-started.md`](docs/getting-started.md) for the full operator guide. Quick path:

1. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the modular component model
2. Read [`AGENTS.md`](AGENTS.md) if you are an AI agent working in this repo
3. **PM intake:** copy [`prompts/issue-intake-chatgpt.md`](prompts/issue-intake-chatgpt.md) into ChatGPT — or use [`skills/issue-intake/SKILL.md`](skills/issue-intake/SKILL.md) in Cursor
4. Validate: `npm run harness:validate-issue -- --file draft.md --intended-phase planning`
5. Dry-run: `npm run harness:run -- --issue WES-XX --dry-run`
6. **Auto-run setup:** [`docs/linear-watcher-setup.md`](docs/linear-watcher-setup.md)

## License

MIT — see [`LICENSE`](LICENSE).
