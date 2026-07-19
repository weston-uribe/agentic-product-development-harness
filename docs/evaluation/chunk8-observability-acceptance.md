# Chunk 8 observability acceptance (redacted)

Date: 2026-07-19  
Branch: `feat/eval-pipeline`  
Public execution: `weston-uribe/p-dev-harness-runner`  
Private state: `weston-uribe/p-dev-harness-state` (`p-dev-runtime-state`)

## Scope

Chunk 8B cutover observability evidence. No issue bodies, plan text, findings, or diffs.

## Public Actions privacy

| Check | Result | Evidence |
|-------|--------|----------|
| No `HARNESS_ISSUE_KEY` in public Auto Runner logs | Pass | Run `29700575985` — count `0` |
| No Linear issue key in public logs | Pass | Same run |
| No target portfolio slug in public logs | Pass | Same run |
| Opaque claim / doctor / run summaries | Pass | Public-safe JSON lines |

Source fix: `e8b119a`.

## Langfuse secrets / config

| Item | Value |
|------|--------|
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Set on `p-dev-harness-runner` and operator `.env.local` (2026-07-19) |
| `LANGFUSE_BASE_URL` | `https://us.cloud.langfuse.com` |
| `LANGFUSE_TRACING_ENVIRONMENT` | `dogfood` |
| `P_DEV_EVALUATION_NAMESPACE` | `weston-dogfood` |
| `P_DEV_EVALUATION_CAPTURE_PROFILE` | `content-v1` |

## Langfuse inspect / cost

| Session | Result | Notes |
|---------|--------|-------|
| Public-runner projection canary | **Pass** | GHA `29702463278` — `acceptanceComplete: true` |
| Local projection canary (`SYN-20260719202319`) | **Pass** | `acceptance.complete: true` |
| TT-13 (fresh Plan Review fixture) local inspect | **Pass** | `acceptance.complete: true`, `generationCostComplete: true` |
| TT-13 GHA inspect (opaque request) | **Pass** | Run `29703385200` on tip `e339b17` — assert passed |
| TT-8 (historical Code Review fixture) | **Fail hard-complete** | Local + GHA `29703386098` — residual error `incomplete_cost_record` (`missing_input_token_usage` on historical implementer generation) |
| TT-7 (historical Plan Review attempt) | **Fail hard-complete** | Residual `incomplete_cost_record` on planner generation |

### Workflow fix

Public `evaluation-inspect-langfuse` assert previously failed even when `acceptance.complete=true` because `node <<'EOF' "$REPORT"` made Node treat the report path as an ESM entry (`ERR_IMPORT_ATTRIBUTE_MISSING`). Fixed by passing `REPORT_PATH` via env (runner tip `e339b17`; source workflow updated in parallel).

### Live emit note

During early TT-13 Auto Runner planning (before secrets were confirmed stable), Langfuse score flush logged `UnauthorizedError` and no traces landed for that live emit. Subsequent public-runner projection canary with the same secrets **succeeded**. TT-13 session was completed via complete-session projection, then hard-inspected successfully. Prefer a live emit re-check on the next ordinary planning job.

## PostHog / Sentry

No new sensitive dumps observed in public runner logs for harness CLI surfaces. Provider UI inventories remain operator-side.

## Verdict

Observability acceptance is **pass** for ordinary new work:

- Public Actions privacy: **pass**
- Langfuse write/read on public runner: **pass** (canary + TT-13 GHA inspect)
- Fresh Plan Review session cost completeness: **pass** (TT-13)
- Historical TT-8 hard inspect complete: **fail** (documented; does not block new issues)
