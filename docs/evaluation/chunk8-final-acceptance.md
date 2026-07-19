# Chunk 8 final acceptance

Date: 2026-07-19  
Branch: `feat/eval-pipeline`  
Workflow schema: `product-development-v2`

## Identities (do not conflate)

| Identity | Value |
|----------|--------|
| Feature branch source SHA | `e8b119aeb878727480647b6c59cff6fd8e925a70` |
| Packaged snapshot content ID | `60bb267bac7b38b784cd31d45bd323ee01f750b3e1d638682ac3dc5fdcc694bd` |
| Snapshot source commit | `e8b119aeb878727480647b6c59cff6fd8e925a70` |
| Public execution tip | `weston-uribe/p-dev-harness-runner@5d6b85d3fe98f1637efe1458d4984ad5379e90fb` (privacy snapshot `156a8ae` + managed marker) |
| Private state repo | `weston-uribe/p-dev-harness-state` branch `p-dev-runtime-state` |
| Old private runner (rollback only) | `weston-uribe/p-dev-harness` — privileged workflows disabled; **not archived** |
| Cloud config fingerprint | `c426a818db0932428a8d8d19b2fa2e85c814641484f072b606b760a4a4457e2b` |

## Chunk 8B cutover (implemented)

| Component | Status | Evidence |
|-----------|--------|----------|
| Public free Actions smoke | Pass | Earlier smoke run `29697826424` |
| Private state migration | Pass | TT-7/TT-8 state copied; Actions disabled on state repo |
| Opaque job-request envelopes | Pass | Bridge/operator dispatch carry `requestId` only |
| Public privacy fix (no issue key in `GITHUB_ENV`) | Pass | Source `e8b119a`; Auto Runner `29700575985` leak counts = 0 for `HARNESS_ISSUE_KEY` / `TT-11` / portfolio slug |
| Config canary on privacy tip | Pass | Run `29700575919` |
| Managed sync CLI | Fail / bypassed | `release:sync-managed-runner --apply` timed out (`fetch failed`); snapshot force-pushed + marker restored via Contents API |
| Old private runner archive | **Not done** | Required only after full acceptance |

## Fresh regression fixtures

Defined in [`chunk8-regression-fixtures.md`](./chunk8-regression-fixtures.md).

### Regression A — Plan Review — **not accepted**

| Attempt | Result |
|---------|--------|
| TT-7 (pre-8B, private runner) | Partial; billing-blocked |
| TT-9 | Canceled — first plan already contained token (no revision path) |
| TT-10 | Escalated to Blocked after 4× `needs_revision`; planner kept omitting token due to lasting “MUST omit” AC |
| TT-11 | Path `Ready for Planning → Planning → Plan Review → Ready for Planning → Planning → Plan Review` with repeated `needs_revision`; cycles exhausted before approve → Ready for Build. Canceled. Public run `29700575985` (privacy-clean). |
| TT-12 | Planning failed (`missing_acceptance_verification_plan`) → Blocked. Canceled. |

Required path still missing:

`… → Plan Review (approve) → Ready for Build`

### Regression B — Code Review (TT-8) — **pass** (pre-cutover evidence retained)

Issue TT-8 completed on the private runner before billing block:

`Building → PR Open → Code Review → Code Revision → Code Review → PM Review`

## Langfuse / cost / privacy

See [`chunk8-observability-acceptance.md`](./chunk8-observability-acceptance.md).

| Check | Status |
|-------|--------|
| Public Actions issue/target privacy | **Pass** (post-`e8b119a`) |
| Langfuse secrets on public runner | **Missing** |
| Fresh Langfuse inspect (TT-8 + Plan Review session) | **Not run** |
| Cost evidence on fresh sessions | **Blocked** |

## Synthetic cleanup

| Artifact | Status |
|----------|--------|
| Validation-run overrides | `zeroActive: true` (`2026-07-19T19:45:51.334Z`) |
| TT-9 / TT-10 / TT-11 / TT-12 | Canceled |
| Global reviews remain enabled | Yes |
| Required Linear statuses remain | Yes |

## Live gates summary

| Gate | Status |
|------|--------|
| Public runner free minutes | Pass |
| Private state split + opaque dispatch | Pass |
| Public log privacy (issue/target) | Pass |
| Config / private-state canaries | Pass (config `29700575919`; earlier state canary `29698431934`) |
| Plan Review revision → Ready for Build | **Fail** |
| Langfuse acceptance | **Blocked** (secrets) |
| Archive old `p-dev-harness` | **Not done** |

## Remaining blockers

1. **Plan Review revision acceptance** — planner does not reliably add `CHUNK8_PLAN_ROLLBACK_TOKEN` on revision cycles when omit language remains in the issue; needs a clean approve → Ready for Build proof.
2. **Langfuse secrets** — operator must set `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` on `p-dev-harness-runner`.
3. **Managed sync reliability** — `release:sync-managed-runner` fetch/push timeouts; manual snapshot push used for 8B privacy redeploy.

## Recommendation

**Not ready** for ordinary real issues.

Do **not** archive `weston-uribe/p-dev-harness` until Plan Review revision + Langfuse gates pass.

Do not open a public harness source PR, merge `feat/eval-pipeline`, publish npm, or tag without explicit authorization.
