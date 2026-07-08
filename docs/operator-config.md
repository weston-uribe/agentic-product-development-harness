# Operator configuration

Guide for private target-repo configuration so production sync and harness automation work for operator-specific repos without committing personal wiring to the public harness repo.

**Related:** [`docs/getting-started.md`](getting-started.md), [`docs/production-sync-automation.md`](production-sync-automation.md), [`docs/security.md`](security.md)

---

## Overview

The committed [`harness.config.json`](../harness.config.json) is a **generic example** (`target-app`, `owner/example-target-app`). Real operator target repos belong in **private configuration** loaded at runtime.

Config resolution order (fail closed):

1. **Explicit CLI `--config`** — only when `argv` contains `--config` (overrides ambient env)
2. **`HARNESS_CONFIG_JSON_B64`** — base64-encoded JSON (GitHub Actions secret)
3. **`HARNESS_CONFIG_JSON`** — raw JSON string (local/debug)
4. **`HARNESS_CONFIG_PATH`** — path to a local config file
5. **`harness.config.json`** — committed default example

If the resolved source is missing, unreadable, or invalid, harness commands exit non-zero.

---

## Local development

Point at a private config file:

```bash
export HARNESS_CONFIG_PATH=/path/to/private/harness.config.json
npm run harness:doctor
```

Or pass an explicit file (overrides env):

```bash
npm run harness:doctor -- --config /path/to/private/harness.config.json
```

Inline JSON for quick tests:

```bash
export HARNESS_CONFIG_JSON='{"version":1,...}'
npm run harness:doctor
```

---

## GitHub Actions (private operator config)

1. Maintain a **private** `harness.config.json` locally — do not commit operator target repos to the public harness repo.
2. Base64-encode the full config (no newlines):

   ```bash
   base64 < private.harness.config.json | tr -d '\n'
   ```

3. Store the result as GitHub Actions secret **`HARNESS_CONFIG_JSON_B64`** on the harness repo.
4. The secret must include all operator `repos[]` entries, Linear mappings, and `allowedTargetRepos`.

The harness workflow sets `HARNESS_CONFIG_JSON_B64` on all jobs (`gate`, `run-harness`, `run-merge`, `sync-production`). Because GHA does not pass `--config`, the secret is used automatically.

---

## Migrating from public target-app config

The committed [`harness.config.json`](../harness.config.json) demonstrates shape only — it is **not** an operator’s live target-repo wiring.

To run production sync for a real target repo:

1. Copy the example config to a **private file** and add your target repo under `repos[]` with a stable `id` (e.g. `real-target`).
2. Add the target URL to `allowedTargetRepos`.
3. Set **`HARNESS_CONFIG_JSON_B64`** in harness repo Actions secrets with the full private JSON.
4. Update the **target repo dispatch workflow** ([`tests/fixtures/workflows/trigger-harness-production-sync.yml`](../tests/fixtures/workflows/trigger-harness-production-sync.yml)) so the `production_promoted` payload `repo` field matches your private config `repos[].id` (not necessarily `target-app`).
5. Until private config is present, production sync **fails closed** with `unknown_repo_id` when dispatch references a repo id not in the resolved config.

See [`docs/production-sync-automation.md`](production-sync-automation.md) for dispatch payload shape and trigger workflow setup.

---

## Target repo dispatch workflow

Install in each target repo (not in the harness repo):

- Path: `.github/workflows/trigger-harness-production-sync.yml`
- Canonical fixture: [`tests/fixtures/workflows/trigger-harness-production-sync.yml`](../tests/fixtures/workflows/trigger-harness-production-sync.yml)

Operator replaces:

- Harness dispatch URL (owner/repo of harness installation)
- Payload `repo` → private config `repos[].id`
- Payload `sourceRepo` → `owner/target-repo` slug matching configured `targetRepo`

**Guards:** runs only on production branch pushes (e.g. `main`), not integration branch pushes.

---

## Branch protection

Target repos should use integration branch + production branch strategy. See [`docs/target-repo-branch-setup.md`](target-repo-branch-setup.md).

Production sync assumes merge commits are promoted to the configured `productionBranch` before dispatch fires.

---

## Token boundary

| Credential | Where | Purpose |
|------------|-------|---------|
| `HARNESS_CONFIG_JSON_B64` | Harness GHA secrets | Private config (sensitive metadata, not a write token) |
| `LINEAR_API_KEY`, `CURSOR_API_KEY`, `HARNESS_GITHUB_TOKEN` | Harness GHA secrets | Live harness phases |
| `HARNESS_DISPATCH_TOKEN` | Target repo GHA secrets | Dispatch-only PAT scoped to harness repo |

Full matrix: [`docs/security.md`](security.md)

Do **not** put merge-capable tokens or Linear/Cursor keys in target repos or Vercel.

---

## Validation

```bash
npm run harness:doctor
HARNESS_CONFIG_PATH=/path/to/private.json npm run harness:doctor
npm test
npm run test:webhook
```

After setting `HARNESS_CONFIG_JSON_B64`, trigger a test `production_promoted` dispatch and confirm the sync job accepts your private repo id (format check in GHA; membership check at runtime).
