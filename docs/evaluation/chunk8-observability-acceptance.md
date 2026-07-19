# Chunk 8 observability acceptance (redacted)

Date: 2026-07-19  
Branch: `feat/eval-pipeline`  
Public execution: `weston-uribe/p-dev-harness-runner`  
Private state: `weston-uribe/p-dev-harness-state` (`p-dev-runtime-state`)

## Scope

Chunk 8C privacy + Langfuse acceptance evidence. No issue bodies, plan text, findings, or diffs.

## Verdict

**Not ready — Chunk 8C live generation cost incomplete.**

### What Chunk 8C fixed

- Public inspect artifacts no longer upload private reports (issue keys / trace names / gap messages).
- Hard acceptance is two-stage: private `coreComplete` then public summary after exact-byte `assertPublicSafe`.
- Unnamed-generation cost bypass removed; TOOL/AGENT containers excluded from required-generation cost gates.
- Public workflow is inspect-only (no reproject / artifact-cache / stdout capture); retention 1 day.
- Historical leaking artifacts deleted (runs `29703385200`, `29703386098` + 3 legacy `langfuse-inspect-*`).

### What still blocks Ready

Untouched live TT-14 Planning + Plan Review Cursor-run generations exist but lack token usage and a truthful USD cost source (`costSource=unavailable`, `provider_did_not_report`). Public summary correctly reports `acceptance.complete=false`.

## Public Actions privacy

| Check | Result | Evidence |
|-------|--------|----------|
| No `HARNESS_ISSUE_KEY` in public Auto Runner logs | Pass | Prior Chunk 8B run `29700575985` |
| Public Langfuse inspect artifact content | **Pass** | Downloaded `eval-inspect-29706749603` (id `8448159354`); exact-byte `assertPublicSafe`; leak scan clean |
| Artifact retention | Pass | Expires `2026-07-20T22:48:59Z` (1 day) |

## Langfuse secrets / config

| Item | Value |
|------|--------|
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Set on `p-dev-harness-runner` |
| `LANGFUSE_BASE_URL` | `https://us.cloud.langfuse.com` |
| `LANGFUSE_TRACING_ENVIRONMENT` | `dogfood` |
| `P_DEV_EVALUATION_NAMESPACE` | `weston-dogfood` |
| `P_DEV_EVALUATION_CAPTURE_PROFILE` | `content-v1` |

## Langfuse inspect / cost

| Session | Result | Notes |
|---------|--------|-------|
| TT-13 GHA inspect (pre-8C) | **Invalidated** | Run `29703385200` leaked private report; cost gate false positive |
| TT-8 historical hard inspect | **Fail** | Cost incomplete; artifact deleted |
| TT-14 private inspect (untouched live) | **Structure pass / cost fail** | Planning + Plan Review present; required gens=2; cost incomplete |
| TT-14 public GHA inspect | **Hard fail (correct)** | Run `29706749603`; public summary only; `privacyValidationPassed=true`; `acceptance.complete=false` |

### Cost-gate false-positive root cause (Chunk 8B)

`generationCostComplete` treated presence of unnamed reprojected generations as sufficient without validating model/token/cost fields. Unnamed `incomplete_cost_record` gaps were warnings only. GHA asserted only `acceptance.complete`.

### Observation deduplication

Session bundles now merge duplicate traces/observations/scores deterministically and emit blocking `duplicate_*_identity_conflict` gaps on identity mismatches. Gap identity uses code + trace/observation ids + normalized reason (not message).

## Live emit note

TT-14 Auto Runner created live Planning and Plan Review traces, agents, and Cursor-run generations without projection/repair. Cost/token fields were not populated by the provider (`provider_did_not_report`). This is **not** proof of cost-complete live telemetry and does **not** restore Ready.

TT-13’s earlier projection-repaired session remains non-evidence for ordinary live emission.

## PostHog / Sentry

No new sensitive dumps observed in public runner logs for harness CLI surfaces.
