# Chunk 8 observability acceptance (redacted)

Date: 2026-07-19  
Branch: `feat/eval-pipeline`  
Public execution: `weston-uribe/p-dev-harness-runner`  
Private state: `weston-uribe/p-dev-harness-state` (`p-dev-runtime-state`)

## Scope

Chunk 8B cutover observability evidence after moving execution to the public runner.
No issue bodies, plan text, findings, or diffs are reproduced here.

## Public Actions privacy

| Check | Result | Evidence |
|-------|--------|----------|
| No `HARNESS_ISSUE_KEY` in public Auto Runner logs | Pass | Run `29700575985` — count `0` |
| No Linear issue key (`TT-11`) in public logs | Pass | Same run — count `0` |
| No target portfolio slug in public logs | Pass | Same run — count `0` |
| Opaque claim / doctor / run summaries | Pass | Public-safe JSON lines (`job_request_claimed`, `phase:doctor`, `phase:planning`) |
| State / execution repo names in job `env:` dumps | Accepted | Architecture-public identifiers only (`p-dev-harness-state` / runner); not issue or target identity |

Source fix: `e8b119a` (private runtime context; no issue key in `GITHUB_ENV` under `P_DEV_PUBLIC_RUNNER_MODE=1`).

## Langfuse

| Check | Result |
|-------|--------|
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` on public runner | **Missing** — secret names absent; values not recoverable from old private runner or `.env.local` |
| Eval vars aligned to dogfood | Set: `LANGFUSE_BASE_URL=https://us.cloud.langfuse.com`, `LANGFUSE_TRACING_ENVIRONMENT=dogfood`, `P_DEV_EVALUATION_NAMESPACE=weston-dogfood`, `P_DEV_EVALUATION_CAPTURE_PROFILE=content-v1` |
| Fresh inspect on TT-8 + Plan Review session | **Not run** — secrets unavailable |
| Cost / privacy Langfuse gates | **Blocked** pending operator-supplied keys |

## PostHog / Sentry

No additional fresh-session inventory in this cutover turn. Public runner log privacy for harness CLI surfaces is covered above; provider UI inventories remain operator-side.

## Gaps

1. Operator must copy `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` onto `weston-uribe/p-dev-harness-runner` (values exist only as secrets on archived-path private `p-dev-harness`).
2. Full Langfuse session completeness for historical TT-8 and a fresh Plan Review approval session remains outstanding.

## Verdict

Observability acceptance for Chunk 8B is **not complete**: public Actions privacy for issue/target identity **passes** on the privacy snapshot; Langfuse inspect/cost acceptance remains **blocked** on missing secrets.
