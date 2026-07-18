# Langfuse M2 Rapid dogfood status

Status: **pending live dogfood** (implementation complete; awaiting managed-runner sync + operator approval).

## Preflight CI evidence

| Item | Detail |
|------|--------|
| CI run | `29628855643` |
| Failed job | `88038585970` |
| Fixed in M2 | `tests/agents/cursor-provider.test.ts` — stale `ObservedAgentRun` assertion after M1 field additions |
| Unresolved Checkpoint | `tests/p-dev/installed-tarball-loopback.test.ts` → `output.ok === false` |
| Unresolved Checkpoint | `tests/p-dev/installed-tarball-snapshot-provisioning.test.ts` → `snapshotOk === false` |
| Root cause (tarball) | **Unproven** — CI logs show assertion failure only |

## Managed runner

- [ ] Snapshot synced from feature commit to `weston-uribe/p-dev-harness`
- [ ] Operator `P_DEV_HOME` with `config.local.json` verified
- [ ] `harness:canary-runner-config` green

## Scenario A — approved without revision

Pending operator-controlled issue/PR.

Expected session scores at merge:

- `revision_required = false`
- `revision_cycle_count = 0`
- `review_outcome = approved_without_revision`
- `merge_completed = true` (when merge proven)
- Truthful `delivery_outcome`

## Scenario B — revision required

Pending separate controlled issue.

Expected session scores at merge:

- `revision_required = true`
- `revision_cycle_count = 1`
- `review_outcome = approved_after_revision`
- `merge_completed = true` (when merge proven)

## Inspection checklist

- [ ] One issue session spans implementation, handoff, optional revision, merge
- [ ] Distinct trace IDs per phase run
- [ ] Local `evaluation/outcomes.json` IDs match Langfuse scores
- [ ] No forbidden content in exported payloads
- [ ] Failed merge attempts do not emit `merge_completed=false` session scores
