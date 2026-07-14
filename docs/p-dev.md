# p-dev — Product Development Harness CLI

**Canonical end-user guide** for the public `p-dev-harness` npm package.

The operator product is still called **p-dev**. The npm package is published as **`p-dev-harness`** because the registry rejected `p-dev` as too similar to the existing [`pdev`](https://www.npmjs.com/package/pdev) package.

`p-dev` launches the guided **Configure GUI** without cloning the harness source repository. It is the primary product-manager path for **v0.3.1**.

## What p-dev is

`p-dev` is a packaged operator shell for the Product Development Harness. It:

- starts the seven-step Configure GUI locally
- stores durable operator state under a workspace directory
- can provision or reconnect a private `OWNER/p-dev-harness` workspace from the **embedded package snapshot** (0.3.1+) or reconnect legacy 0.3.0 managed workspaces
- guides service credentials, Linear workspace/status setup, Vercel webhook bridge, target repos, local files, cloud secrets, and target workflow finalization

It does **not** replace the source repository for harness development or contribution.

## Supported environment

| Requirement | Detail |
|-------------|--------|
| Node.js | **22+** required |
| Packaged platform | **macOS validated** for browser auto-launch |
| Agent provider | **Cursor only** (implemented) |
| Control plane | **Linear + GitHub + GitHub Actions + Vercel** (supported stack) |
| Maturity | Early-stage operator tool — **not** production SaaS |

On non-macOS platforms, use `--no-open` and open the printed Configure URL manually. Browser auto-launch is not validated outside macOS.

## Install and launch

Pinned release:

```bash
npx --yes p-dev-harness@0.3.1
```

Latest channel:

```bash
npx --yes p-dev-harness
```

Do not open a browser automatically:

```bash
npx --yes p-dev-harness@0.3.1 --no-open
```

Use a custom workspace directory:

```bash
npx --yes p-dev-harness@0.3.1 --workspace /path/to/workspace
```

Or set `P_DEV_HOME`:

```bash
export P_DEV_HOME=/path/to/workspace
npx --yes p-dev-harness@0.3.1
```

Default workspace when neither flag nor env is set: `~/.p-dev`.

## Workspace and local state

Workspace resolution priority: `--workspace` → `P_DEV_HOME` → `~/.p-dev`.

The workspace is durable operator state. Typical files:

| Path | Purpose |
|------|---------|
| `.env.local` | Local secrets and config pointer (gitignored pattern) |
| `.harness/config.local.json` | Operator harness config |
| `.harness/p-dev-managed-repo.json` | Managed private harness workspace marker (when provisioned) |

`p-dev` seeds safe templates (`.env.example`, `.harness/config.example.json`) **without overwriting** existing operator files. Package preparation and npm install do **not** overwrite an existing workspace.

## Required credentials

You need accounts and API keys for:

- **Linear** — workspace/team/project and workflow statuses
- **Cursor** — cloud agent API key
- **GitHub** — classic personal access token for packaged provisioning and remote setup
- **Vercel** — team/project for the webhook bridge (when using cloud automation)

### GitHub token permissions (derived from implementation)

**Packaged workspace provisioning (Step 1, packaged mode only):**

- Classic PAT required — fine-grained tokens are **not** supported for automatic provisioning
- Scopes: **`repo`** and **`workflow`**
- `public_repo` alone is insufficient for private workspace creation

**Guided setup generally:**

- Classic PAT: **`repo`** (or `public_repo` for public repos) and **`workflow`**
- Fine-grained PAT: **Contents write** plus **Workflows write** on each target repo (workflow write is confirmed per repo in later steps; GitHub does not expose a dedicated read-only workflow-write API)

Step 1 helper text: *"Use a classic GitHub personal access token with repo and workflow access. This lets the harness check your repos, save encrypted setup secrets, and open workflow install PRs later."*

Do not commit tokens. Secret values never belong in docs, git, or PR comments.

## Embedded workspace snapshot (0.3.1+)

Fresh private harness workspaces are provisioned from the **immutable embedded workspace snapshot** inside the exact `p-dev-harness@X.Y.Z` npm package you install:

- Snapshot manifest: `workspace-snapshot/manifest.json` in the published tarball
- Provisioning uses GitHub git object APIs (`createUserRepository` + blob/tree/commit)
- Marker v3 records `createdFromPackageSnapshot` provenance tied to the embedded manifest
- Package version and snapshot identity are bound — reinstalling a different package version does not silently rewrite an existing workspace

**First-time provisioning can take several minutes** while hundreds of snapshot blobs upload. Configure shows upload progress. If GitHub rate-limits the upload, the harness coordinates a shared pause and retries automatically.

Optional advanced override: `HARNESS_SNAPSHOT_UPLOAD_CONCURRENCY` (integer `1`–`4`; default `2`). Ordinary users do not need to set this.

### Legacy 0.3.0 reconnect

Valid existing managed workspaces created by `p-dev-harness@0.3.0` from `weston-uribe/p-dev-harness-template` reconnect without content rewrite. The public template is a **frozen legacy compatibility artifact** for 0.3.0 only — it is not used for 0.3.1+ fresh provisioning and does not need to remain available for new 0.3.1 installs.

## Seven guided setup stages

| Step | Title | What it does |
|------|-------|--------------|
| 1 | Connect services | Verify and save Linear, Cursor, GitHub, Vercel credentials; packaged mode may provision private harness workspace |
| 2 | Set up Linear workspace | Create/map team, project, and required workflow statuses (confirmation-gated) |
| 3 | Set up Vercel webhook bridge | Create/map Vercel resources, upsert env vars, configure Linear webhook, trigger production redeploy, verify signed webhook |
| 4 | Choose target repo(s) | Select targets and create local setup files (confirmation-gated local writes) |
| 5 | Check local readiness | Validate local config and permissions before cloud writes |
| 6 | Connect cloud secrets | Write harness repo GitHub Actions secrets (confirmation-gated) |
| 7 | Install target repo workflow | Create/reuse workflow install PR, validate checks, guarded merge, verify on production branch |

Remote mutations require explicit confirmation and fingerprint checks. Step 1 does **not** auto-advance when keys become complete — click **Continue**.

### Step 7 workflow finalization

For harness-owned setup PRs, Step 7:

- creates or updates `.github/workflows/trigger-harness-production-sync.yml` on an install branch
- opens or reuses a PR (never writes directly to production)
- polls required checks
- merges automatically when checks pass and content is valid
- verifies the workflow exists on the production branch after merge

This automation applies to **system-owned setup PRs only**. Ordinary product implementation PRs remain governed by Linear status gates and are not made generically auto-mergeable.

## Stop, restart, and resume

- Stop: `Ctrl+C` in the terminal running `p-dev`
- Restart: run the same `npx` command again
- Resume: use the same workspace (`P_DEV_HOME` or `--workspace`); seeded and applied files are preserved

## Troubleshooting

| Symptom | Action |
|---------|--------|
| `ENOSPC` from npm `_npx` cache | Free disk space or clear npm cache — **do not delete `~/.p-dev`** unless you intend to reset operator state |
| Browser does not open | Use `--no-open` and open the printed URL manually |
| Step 6 blocked | Ensure harness dispatch repo is resolved (packaged provisioning or explicit config) |
| Fine-grained PAT at Step 1 | Use classic `repo` + `workflow` for packaged provisioning; fine-grained may work for later steps with per-repo permissions |
| Slow first provisioning | Normal for 0.3.1+ snapshot upload; wait for progress to complete; rate-limit pauses retry automatically |
| Port in use | `p-dev` scans from port 3000; use the URL printed in the terminal |

### Uninstall npm execution artifacts without deleting operator state

To clear cached npx execution without removing `~/.p-dev`:

```bash
npm cache clean --force
```

Operator workspace files under `P_DEV_HOME` or `~/.p-dev` are separate from npm cache.

## Security boundaries

- Secrets live in local workspace files, GitHub Actions secrets, and Vercel env vars — never in the published package
- Remote writes are confirmation-gated with fingerprint validation
- Harness output is redacted before logs and artifacts
- The published tarball excludes `.env.local`, local config, control-plane state, credentials, and generated private workspace content

## Known limitations

- **Cursor-only** agent provider
- **Linear / GitHub / GitHub Actions / Vercel** stack only
- **macOS validated** for packaged browser auto-launch; other platforms use `--no-open`
- **No full real issue lifecycle** has been run from an isolated npm-installed workspace — setup completion is validated; end-to-end issue runs from a fresh npm install are not
- **No automatic upgrade/sync** of an already-created private harness workspace to a newer package snapshot
- **Not production-grade SaaS** or provider-agnostic
- Manual eval rubrics remain where automation is not implemented

## Source development path

Contributors and harness maintainers should clone the source repository:

```bash
git clone https://github.com/weston-uribe/agentic-product-development-harness.git
cd agentic-product-development-harness
npm ci && npm run build
npm run harness:configure
```

See [`docs/getting-started.md`](getting-started.md) and [`README.md`](../README.md).

## Related docs

- Release contract: [`docs/releases/v0.3.1.md`](releases/v0.3.1.md)
- Local GUI (source): [`docs/gui-local.md`](gui-local.md)
- Remote setup: [`docs/gui-remote-setup.md`](gui-remote-setup.md)
- Security: [`docs/security.md`](security.md)
- Historical packaging spike notes: [`docs/npm-packaging-spike.md`](npm-packaging-spike.md)
