# Production sync automation

Operator guide for automatic production sync after portfolio `dev → main` promotion.

**Related:** [`docs/target-repo-branch-setup.md`](target-repo-branch-setup.md), [`docs/linear-watcher-setup.md`](linear-watcher-setup.md)

---

## Overview

When `weston-uribe/weston-uribe-portfolio` **`main`** receives a push (after manual `dev → main` promotion), the harness should run production sync automatically:

```text
portfolio push to main → repository_dispatch production_promoted → harness GHA → harness:sync-production --repo portfolio
```

Powerful tokens stay in the **harness repo** GitHub Actions secrets only. The portfolio repo receives at most **`HARNESS_DISPATCH_TOKEN`** (dispatch-only PAT scoped to the harness repo).

Manual CLI remains supported:

```bash
npm run harness:sync-production -- --repo portfolio
```

---

## Workflow scope preflight

Any add or update under `.github/workflows/**` may require a git credential with GitHub **`workflow` scope**. Before pushing workflow files:

1. Run `gh auth status` and confirm scopes include `workflow`, **or**
2. Apply workflow YAML via GitHub web UI (Settings → Actions → workflow editor / “Add file”), **or**
3. Push with a PAT that includes `workflow` + `repo`.

If workflow files cannot be pushed, use the exact YAML below via GitHub UI. Do **not** leave untracked workflow files in a local clone.

---

## Harness repo: `harness-auto-runner.yml`

**Track A:** merge the updated workflow to [`.github/workflows/harness-auto-runner.yml`](../.github/workflows/harness-auto-runner.yml) using a credential with **`workflow` scope**.

**Track B (OAuth lacks `workflow` scope):** copy the full intended workflow from [`tests/fixtures/workflows/harness-auto-runner-with-production-sync.yml`](../tests/fixtures/workflows/harness-auto-runner-with-production-sync.yml) into GitHub web UI → edit `harness-auto-runner.yml` on `main`. Automation is **not live** until this lands on origin.

The harness workflow must include:

- `repository_dispatch` type **`production_promoted`**
- Job **`sync-production`** running `npm run harness:sync-production -- --repo … --json`
- Optional **`workflow_dispatch`** input **`sync_repo`** (e.g. `portfolio`) for manual cloud sync

### Manual cloud sync (harness Actions)

Actions → **Harness Auto Runner** → Run workflow → set **`sync_repo`** = `portfolio` (leave **`issue`** empty).

---

## Event payload

**Event type:** `production_promoted`

```json
{
  "repo": "portfolio",
  "productionBranch": "main",
  "sourceRepo": "weston-uribe/weston-uribe-portfolio",
  "after": "<commit-sha-on-main>",
  "ref": "refs/heads/main",
  "receivedAt": "2026-07-07T23:46:00.000Z"
}
```

Optional: `githubRunId`, `githubDeliveryId` (audit only). Harness ignores `after` for promotion proof; per-issue strong proof is unchanged.

### Test dispatch (no portfolio push)

```bash
gh api repos/weston-uribe/agentic-product-development-harness/dispatches \
  -f event_type=production_promoted \
  -f 'client_payload[repo]=portfolio' \
  -f 'client_payload[productionBranch]=main' \
  -f 'client_payload[sourceRepo]=weston-uribe/weston-uribe-portfolio' \
  -f 'client_payload[after]=<main-sha>' \
  -f 'client_payload[ref]=refs/heads/main' \
  -f 'client_payload[receivedAt]=$(date -u +%Y-%m-%dT%H:%M:%SZ)'
```

Requires a PAT with **Contents: write** on the harness repo (same class as Vercel `GITHUB_DISPATCH_TOKEN`).

---

## Portfolio repo: trigger workflow

**Track A:** add the file below to **`weston-uribe/weston-uribe-portfolio`** using a **`workflow`-scoped** credential.

**Track B:** copy from [`tests/fixtures/workflows/trigger-harness-production-sync.yml`](../tests/fixtures/workflows/trigger-harness-production-sync.yml) via GitHub web UI → **Add file** on portfolio `main`.

Path: `.github/workflows/trigger-harness-production-sync.yml`

```yaml
# See tests/fixtures/workflows/trigger-harness-production-sync.yml for canonical content.
```

**Guards:** runs only on **`main`** pushes — not `dev`, not issue branches.

### Portfolio secret

In **portfolio** repo → Settings → Secrets and variables → Actions:

| Secret | Permission |
|--------|------------|
| `HARNESS_DISPATCH_TOKEN` | Fine-grained **Contents: Read and write** on `weston-uribe/agentic-product-development-harness` only; or classic `repo` scoped to harness repo |

Can reuse the same PAT as Vercel `GITHUB_DISPATCH_TOKEN` for the Linear bridge.

**Do not** add `LINEAR_API_KEY` or merge-capable portfolio `GITHUB_TOKEN` to the portfolio repo.

---

## Track B: webhook trigger (optional)

If adding a portfolio workflow file is blocked, configure a **GitHub repo webhook** on the portfolio repo (Settings → Webhooks):

- URL: future harness Vercel endpoint (not implemented in v1; prefer portfolio workflow above)
- Events: **Push**
- Filter in handler: `ref == refs/heads/main` only

The harness workflow change on `production_promoted` is **still required**; webhook only replaces the portfolio workflow file.

---

## Validation gates

1. `npm test`, `npm run test:webhook`, `npm run build`, `npm run harness:doctor`
2. Dispatch test (`gh api … production_promoted`) → harness **sync-production** job runs (not `run-harness`)
3. Portfolio push to **`main`** → dispatch → sync job
4. Portfolio push to **`dev`** → no dispatch workflow run
5. Repeat **`main`** push → idempotent (no duplicate Linear comments)
6. Issues update to **Merged / Deployed** only when merge commit is reachable on `main` (strong proof)

---

## Rollback

1. Disable or delete portfolio `trigger-harness-production-sync.yml`
2. Remove `production_promoted` handler from harness workflow (or disable workflow)
3. Continue manual sync: `npm run harness:sync-production -- --repo portfolio`
