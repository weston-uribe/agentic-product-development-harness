# Getting started

Operator guide for setting up and validating the agentic product development harness locally.

**Honest positioning:** V0.2.0 is an early-stage, Cursor-first orchestration harness — not a generic plug-and-play product. Expect manual operator setup for Linear, GitHub Actions, Vercel, and target repos.

**Release contract:** [`docs/releases/v0.2.0.md`](releases/v0.2.0.md)

## Start here

Use this order:

1. Run the repo locally with no live automation.
2. Validate an issue draft.
3. Configure target repos and secrets.
4. Run doctor checks.
5. Enable the Linear webhook only after local validation passes.

**If you only want to understand the project**, read:

- [`README.md`](../README.md)
- [`docs/releases/v0.2.0.md`](releases/v0.2.0.md)
- [`ARCHITECTURE.md`](../ARCHITECTURE.md)

**If you want to operate it**, continue below.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js 22+ | Matches CI |
| npm | `npm ci` for reproducible installs |
| Git | Clone this repo |
| Linear account | Team with harness workflow statuses |
| GitHub account | Access to harness repo and target repos |
| Cursor API key | For live cloud agent phases (optional for dry-run) |
| Linear API key | For live issue reads/writes (optional for dry-run) |

---

## Clone and install

```bash
git clone https://github.com/weston-uribe/agentic-product-development-harness.git
cd agentic-product-development-harness
npm ci
npm run build
npm test
```

---

## Configuration

The committed [`harness.config.json`](../harness.config.json) is a generic example/fallback. For real target repos, use private operator config — see [`docs/operator-config.md`](operator-config.md).

**Recommended local setup:**

1. `npm install` (or `npm ci`)
2. `npm run harness:gui` — open Settings / Configure and use guided forms to preview and apply local `.env.local` + `.harness/config.local.json` (see [`docs/gui-local.md`](gui-local.md))
3. Or `npm run harness:operator:init` — CLI scaffold from committed examples (does not overwrite unless `--force`)
4. `npm run harness:doctor` — validates config (reads `HARNESS_CONFIG_PATH` from `.env.local` when present)
5. Base64-encode `.harness/config.local.json` and set GitHub Actions secret **`HARNESS_CONFIG_JSON_B64`** on the harness repo for cloud runs
6. Configure remaining GitHub Actions secrets (`LINEAR_API_KEY`, `CURSOR_API_KEY`, `HARNESS_GITHUB_TOKEN`)

Add more entries to `repos[]` and `allowedTargetRepos[]` for every repo you want the harness to manage. The starter example includes one target repo only.

For merge-phase checks with a GitHub token:

```bash
npm run harness:doctor -- --profile merge
```

(Set `GITHUB_TOKEN` in `.env.local`.)

Note: `harness:doctor` with live API keys is not a dry-run — it validates credentials and repo access.

---

## Where secrets go

| Secret class | Store here | Never store here |
|--------------|------------|------------------|
| `LINEAR_API_KEY`, `CURSOR_API_KEY`, `HARNESS_GITHUB_TOKEN` | GitHub Actions secrets | Vercel, committed files |
| `LINEAR_WEBHOOK_SECRET`, `GITHUB_DISPATCH_TOKEN` | Vercel production env | GitHub Actions (for bridge), committed files |
| Local dev tokens and config pointer | Untracked `.env.local` (gitignored) | Commits, docs, examples |

Secret names may appear in docs; secret values must never appear in docs, commits, examples, logs, or PR comments.

Full matrix: [`docs/security.md`](security.md)

---

## Local validation before live automation

These commands are intended to prove parsing, config shape, and artifact inspection before you enable Linear/GitHub/Vercel automation.

**Fully local** — no live APIs required:

Validate an issue draft from a file:

```bash
npm run harness:validate-issue -- --file draft.md --intended-phase planning
```

Dry-run harness routing with a fixture:

```bash
npm run harness:run -- --issue WES-FIXTURE --dry-run \
  --fixture tests/fixtures/issues/valid-target-app.md
```

Inspect a run artifact directory:

```bash
npm run harness:inspect -- --run runs/WES-FIXTURE/<run-id>
```

**Not fully local** — `harness:doctor` and live harness phases require API keys and may read or write external systems.

---

## Live setup (production automation)

These require operator configuration outside this repo:

| Component | Guide |
|-----------|-------|
| Private operator config (env / GHA secret) | [`docs/operator-config.md`](operator-config.md) |
| Linear webhook + Vercel bridge + GHA auto-runner | [`docs/linear-watcher-setup.md`](linear-watcher-setup.md) |
| Target repo branch strategy (`dev` / `main`) | [`docs/target-repo-branch-setup.md`](target-repo-branch-setup.md) |
| Production sync after `dev` → `main` promotion | [`docs/production-sync-automation.md`](production-sync-automation.md) |
| Security baseline and solo repo policy | [`docs/security.md`](security.md) |
| Provider / portability posture | [`docs/provider-portability.md`](provider-portability.md) |

---

## PM issue intake

1. Copy [`prompts/issue-intake-chatgpt.md`](../prompts/issue-intake-chatgpt.md) into ChatGPT, **or**
2. Use [`.agents/skills/issue-intake/SKILL.md`](../.agents/skills/issue-intake/SKILL.md) in Cursor
3. Validate before creating the Linear issue: `npm run harness:validate-issue`

Details: [`docs/issue-intake.md`](issue-intake.md)

---

## What not to do

- Do not commit secrets to the repo, docs, or examples
- Do not put merge-capable GitHub tokens in Vercel
- Do not assume provider agnosticism — Cursor is the only implemented agent provider
- Do not run live harness phases against production issues without understanding Linear status side effects
- Do not create git tags or GitHub releases from doc PRs — follow [`docs/releases/release-process.md`](releases/release-process.md) after merge

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `validate-issue` fails on headers | Compare draft to [`templates/linear-issue.md`](../templates/linear-issue.md) |
| `doctor` reports missing base branch | Create integration branch on target repo; see branch setup doc |
| Auto-run does not trigger | Vercel env vars, Linear webhook URL, dispatch token scope |
| Merge blocked | PR checks on target repo; issue must be **Ready to Merge** in Linear |
| Production sync no-op | Merge commit must be reachable on `productionBranch`; see promotion guidance |

Architecture overview: [`ARCHITECTURE.md`](../ARCHITECTURE.md)  
Agent working in this repo: [`AGENTS.md`](../AGENTS.md)
