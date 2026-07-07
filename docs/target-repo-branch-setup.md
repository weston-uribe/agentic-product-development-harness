# Target repo branch setup

The harness merges pull requests into an **integration branch** configured per repo (`repos[].baseBranch`, e.g. `dev`). Production promotion (`dev` → `main`) is a separate, manual step and is **not** automated in v0.1.

## Config fields

| Field | Purpose |
|-------|---------|
| `baseBranch` | Integration branch PRs target and merge into |
| `productionBranch` | Production branch (default `main`) used for merge success routing |
| `integrationPreviewUrl` | Stable dev/staging preview link for merge comments |
| `integrationSuccessStatus` | Linear status after integration merge (default `Merged to Dev`) |
| `productionSuccessStatus` | Linear status after production merge (default `Merged / Deployed`) |

When `baseBranch === productionBranch`, behavior matches the original single-branch workflow: merge success moves the issue to **`Merged / Deployed`** and production deployment polling runs as before.

When `baseBranch !== productionBranch`, merge success moves the issue to **`Merged to Dev`**, merge comments note the change is **not yet in production**, and production deployment polling is skipped.

## Linear setup (before changing portfolio `baseBranch`)

1. Add workflow status **`Merged to Dev`** on the team used by harness issues.
2. Set `linear.transitionalStatuses.mergedToDev` in `harness.config.json` if your team uses a different label.
3. Optionally set repo-level `integrationSuccessStatus` / `productionSuccessStatus` overrides.

## GitHub setup

1. Create the integration branch on the target repo (e.g. `dev` from `main`).
2. Set `repos[].baseBranch` to that branch.
3. Run `npm run harness:doctor` with `GITHUB_TOKEN` set — doctor verifies each mapped repo has the configured base branch.

## Validation

- **Preflight / doctor:** `assertBaseBranchExists()` when `GITHUB_TOKEN` is available.
- **Implementation / handoff / revision / merge:** PR base must match `repos[].baseBranch` (`wrong_pr_base_branch` if not).

## Example (portfolio)

```json
{
  "id": "portfolio",
  "targetRepo": "https://github.com/weston-uribe/weston-uribe-portfolio",
  "baseBranch": "dev",
  "productionBranch": "main",
  "integrationPreviewUrl": "https://your-dev-preview.example",
  "integrationSuccessStatus": "Merged to Dev",
  "productionSuccessStatus": "Merged / Deployed"
}
```
