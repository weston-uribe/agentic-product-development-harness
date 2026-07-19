# Chunk 8 final acceptance

Date: 2026-07-19  
Branch: `feat/eval-pipeline`  
Workflow schema: `product-development-v2`

## Identities (do not conflate)

| Identity | Value / status |
|----------|----------------|
| Feature branch source SHA | _(filled at commit)_ |
| Packaged snapshot / content identity | _(filled after managed-runner sync)_ |
| Managed-runner git SHA (`weston-uribe/p-dev-harness`) | _(filled after sync)_ |
| Runtime-state branch | `p-dev-runtime-state` |
| Target application PR SHAs | _(filled from fresh regressions)_ |

## Product behavior implemented

### Defaults

- `NEW_WORKSPACE_OPTIONAL_PHASE_DEFAULTS`: Plan Review + Code Review **on**, cycles `4`
- `LEGACY_WORKFLOW_MIGRATION_DEFAULTS`: both **off** for configs with no `workflow` section
- First-run config builder persists `workflow` + explicit `roleModels` for planner, builder, planReviewer, codeReviewer, codeReviser

### Enable / provision transaction

When enabling either global review:

1. Preflight every configured Linear team
2. Stop on category conflict before creates or config writes
3. Create missing statuses idempotently
4. Re-read and verify every team
5. Only then save local config + cloud sync
6. Effective activation only after cloud fingerprint verification

Partial create → statuses kept, enable not saved, setup_required, retryable.  
Cloud sync fail after provision → local rollback, statuses left, effective false.

### Durable managed state

- `GithubWorkflowStateStore` on `p-dev-runtime-state` at `.p-dev/workflow-state/<team-id>/<issue-key>.json`
- Explicit `P_DEV_WORKFLOW_STATE_STORE_MODE=managed_github|file|memory` — managed never falls back to file
- Decision-before-effects ledger + handoff subject CAS pattern
- Freeze continuity across jobs from durable state

### Identities

- Handoff subject: issue + target repo + implementation generation + PR + head + diff
- Review subject separate from reviewer generation; accepted decision = decision + subject
- Linear decision comment dedupe before post

### Reconciliation

- Auto Runner accepts `plan_review` / `code_review` / `code_revision`
- FRE-3 seed replaced by `harness:reconcile-workflow`
- Langfuse inspect GHA hard-fails; cost evidence requires tokens, model/variant, pricing-registry version, exactly one truthful USD source

### Global GUI

- Cards show: “This setting applies to every issue handled by this harness.”
- Multi-team readiness intersection for optional review statuses

## Fresh regression fixtures

Defined in [`chunk8-regression-fixtures.md`](./chunk8-regression-fixtures.md):

- Plan Review: omit / require `CHUNK8_PLAN_ROLLBACK_TOKEN`
- Code Review: `CHUNK8_CODE_TOKEN_V1` → `CHUNK8_CODE_TOKEN_V2`

## Live gates (post-implementation)

| Gate | Status |
|------|--------|
| Local build + focused tests | Pass (see commit) |
| Managed-runner sync | Pending |
| Config canary | Pending |
| GUI global enable (Plan + Code Review, cycles 4) | Pending |
| Fresh Plan Review revision regression | Pending |
| Fresh Code Review revision regression | Pending |
| Langfuse acceptance on fresh sessions | Pending |
| Synthetic cleanup (PRs #40–#44, TT-2–TT-6) | Pending |

## Current global saved settings (pre-activation)

Weston’s existing harness is expected to retain explicit disabled reviews until Workflow GUI enable during activation. Legacy configs without `workflow` remain migrated off.

## Recommendation

**Not ready** for Weston to begin ordinary real issues until live gates above pass and this report is updated with managed-runner SHA, runtime-state proof, regression histories, Langfuse/cost acceptance, and cleanup proof.

After those gates: leave Plan Review and Code Review globally enabled; do not open a public harness PR, merge `feat/eval-pipeline`, publish npm, or tag without explicit authorization.
