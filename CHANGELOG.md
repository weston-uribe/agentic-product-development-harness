# Changelog

All notable changes to this harness repo are documented here.

This is a **GitHub source release** changelog. The harness is `private: true` and is **not** published to npm.

## Unreleased

- Milestone 5 PR 2: remote setup GUI with confirmation-gated harness repo Actions secret writes and target workflow branch/PR installs (`preview-harness-secrets`, `apply-harness-secrets`, `preview-target-workflow`, `apply-target-workflow` API routes).
- Milestone 5 PR 1: setup-core remote contracts, preview models, permission gates, redaction helpers, manual instructions, dispatch repo resolution, and deferred apply function signatures.
- Milestone 4 GUI: guided local configuration with preview/confirmation-gated writes for `.env.local` and `.harness/config.local.json`.
- Generalized public target-repo examples and removed personal target repo references from docs.

## [0.2.0] — 2026-07-08

V0.2.0 moves the harness from early validated spikes to a documented source release: lifecycle runners, Linear-triggered GitHub Actions automation, production sync, provider posture, security hardening, and operator docs now tell one consistent story.

**Release type:** GitHub source release (annotated tag + GitHub release). Not an npm package publication.

### Added

- SDK lifecycle runners: planning, implementation, handoff, revision, merge, and production sync
- Event-driven auto-runner: Linear webhook → Vercel bridge → `repository_dispatch` → GitHub Actions → `harness run --phase auto`
- Trigger statuses: Ready for Planning, Ready for Build, PR Open, Needs Revision, Ready to Merge
- Explicit `agentProvider.id: "cursor"` config shape and internal provider seam (`src/agents/`)
- Issue intake: ChatGPT copy-paste prompt, Cursor issue-intake skill, parser-aligned template, `harness validate-issue` CLI
- Production sync automation (`harness:sync-production`) with optional `production_promoted` dispatch
- Target-repo integration-branch posture: PRs target `dev`; manual `dev` → `main` promotion; sync updates Linear
- GitHub Actions hardening: pinned actions, env-var shell safety, output redaction
- CI / CodeQL / Dependabot
- Public-repo security baseline and operator guides
- Release contract (`docs/releases/v0.2.0.md`), release process, operator getting-started guide

### Changed

- Harness positioned as Cursor-first for Linear + GitHub + GitHub Actions (not provider-agnostic)
- Solo repo automation policy: PR required + required checks + no direct push to `main`; **0 required GitHub approvals** while solo-maintainer
- `package.json` version marker `0.1.0` → `0.2.0` (source release only; `private: true` unchanged)

### Security

- Branch protection ruleset active on `main` (PR required, required status checks, no force push)
- GitHub Actions allowed-actions allowlist (pinned first-party actions)
- Secrets confined to GitHub Actions secrets, Vercel env vars, or local untracked `.env` files
- Harness output redaction before logs, summaries, and artifacts
- `.github/CODEOWNERS` documents ownership of workflow files (not enforced as required review in solo mode)

### Documentation

- Truth audit across README, ROADMAP, ARCHITECTURE, AGENTS, security, and operator guides
- Provider portability posture (`docs/provider-portability.md`)
- Linear watcher setup, target-repo branch setup, production sync automation guides

### Known limitations

- Cursor Cloud Agents are the **only** implemented agent provider
- Linear is the only implemented product/control system; GitHub is the only SCM/PR system
- Vercel is the only implemented preview provider when preview capture is enabled
- Not provider-agnostic; no Claude Code, Codex, local VS Code agents, GitLab, or Bitbucket support
- Evals remain manual rubrics — automated eval contract is deferred
- Not production-grade portable; not a plug-and-play product
- OpenSSF Scorecard deferred
- No generic auto-merge for arbitrary green public PRs
- Linear/status gates required — automation does not ship without human-controlled status transitions
- npm package publication and stability are explicitly out of scope

[0.2.0]: https://github.com/weston-uribe/agentic-product-development-harness/releases/tag/v0.2.0
