# Chunk 8 final acceptance

Date: 2026-07-19  
Branch: `feat/eval-pipeline`  
Workflow schema: `product-development-v2`

## Recommendation

**Not ready — Chunk 8C live generation cost incomplete.**

Chunk 8C fixed public artifact privacy and false-positive acceptance gates. Untouched live Planning + Plan Review telemetry for TT-14 is present, but required Cursor-run generations lack input/output token usage and a truthful USD cost source (`costSource=unavailable` / `provider_did_not_report`). Hard acceptance correctly fails. Ready is not restored.

## Identities (do not conflate)

| Identity | Value |
|----------|--------|
| Feature branch tip (Chunk 8C) | `5da4a8eb33f5b6d2b23fa5db352f024830fde18b` |
| Chunk 8C primary commit | `b3df8593d7774f36cd54e3e784c6cf2f38c32d6e` |
| Packaged snapshot content ID | `b9b5bad4e30fd5aad3a29f7f926a8f14cf08da0dcf46a9de9c656006f5184ff0` |
| Public execution tip | `weston-uribe/p-dev-harness-runner@5bbd214e704451b1fc63eda4e17e45bc808b8f10` |
| Private state tip | `weston-uribe/p-dev-harness-state` (`p-dev-runtime-state`) |
| Old private runner | `weston-uribe/p-dev-harness` — **archived** |
| Cloud config fingerprint | unchanged from Chunk 8B (`c426a818…`) |

## Chunk 8C corrections (implemented)

| Item | Result |
|------|--------|
| Public leak (full inspect JSON) | **Fixed** — public workflow uploads only `langfuse_inspect_public_summary` |
| Affected leak runs | `29703385200`, `29703386098` — artifacts **deleted**; API remaining count `0` |
| Legacy `langfuse-inspect-*` artifacts | **3 deleted** (aggregate); runs kept |
| Cost-gate false positive | **Fixed** — unnamed existence bypass removed; required generations fail-closed |
| Observation / score / gap merge | **Fixed** — deterministic merge + `duplicate_*_identity_conflict` |
| Two-stage acceptance | **Fixed** — private `coreComplete` vs public `acceptance.complete` after exact-byte `assertPublicSafe` |
| Public workflow reprojection | **Removed** — inspect-only; no artifact-cache download; retention 1 day |
| Managed sync CLI | **Worked** for Chunk 8C (`release:sync-managed-runner --apply`) |

## Fresh live issue (TT-14)

Ordinary globally enabled workflow. No validation-run override. No projection / reproject / manual traces / status repair after entry.

Path observed:

`Ready for Planning → Planning → Plan Review → Ready for Build` (one clean Plan Review approval)

Continued automatically into Building / Code Review / PM Review (out of Chunk 8C Langfuse gate scope).

Linear: [TT-14](https://linear.app/weston-product-lab/issue/TT-14/chunk-8c-live-langfuse-emission-canary) — **Canceled** after evidence.  
Portfolio PR [#48](https://github.com/weston-uribe/weston-uribe-portfolio/pull/48) — **Closed** without merge.

### Langfuse private inspect (untouched session)

| Check | Result |
|-------|--------|
| Planning trace / planner agent / planner Cursor-run generation | **Present** |
| Plan Review trace / plan_reviewer agent / plan_reviewer Cursor-run generation | **Present** |
| Required generation count | `2` |
| Generation cost complete | **Fail** — both required gens `missing_input_token_usage` / `costSource=unavailable` (`provider_did_not_report`) |
| `coreComplete` | `false` |

### Public GHA inspect + remote artifact verification

| Check | Result |
|-------|--------|
| Public inspect run | `29706749603` — CLI exit non-zero (incomplete acceptance); public summary uploaded |
| Artifact name | `eval-inspect-29706749603` |
| Artifact ID | `8448159354` |
| Contents | Exactly one file: `public-inspect-29706749603.json` |
| Digest (sha256) | `3f693daf9242c88073adf9c235469dce8d616d81cc2ad925cea0437eb90aeeb9` |
| Size | 561 bytes compressed / 857 bytes JSON |
| Expiration | `2026-07-20T22:48:59Z` (1-day retention) |
| `assertPublicSafe` on exact bytes | **Pass** |
| ZIP/file leak scan (issue keys, `TT-`, repo slugs, GitHub/PR URLs, names, paths, secrets) | **Pass** (no matches) |
| Public counts vs private | Match (`requiredGenerationCount=2`, `incompleteRequiredGenerationCount=2`, `errorGapCount=2`) |
| `privacyValidationPassed` | `true` |
| Public `acceptance.complete` | `false` (correct hard fail) |

## Synthetic cleanup

| Artifact | Status |
|----------|--------|
| Validation-run overrides | `zeroActive: true` (`2026-07-19T22:49:41.167Z`) |
| TT-14 | Canceled |
| Portfolio PR #48 | Closed without merge |
| TT-9 / TT-10 / TT-11 / TT-12 / TT-13 | Canceled (prior) |
| Global reviews remain enabled | Yes |

## Live gates summary

| Gate | Status |
|------|--------|
| Public runner free minutes / smoke | Pass (`29705672762`) |
| Private state split + opaque dispatch | Pass |
| Public log privacy (issue/target) | Pass |
| Public Langfuse **artifact** privacy | **Pass** (remote download + leak scan) |
| Untouched live Planning + Plan Review traces/agents/gens | **Pass** (TT-14) |
| Untouched live required-generation cost completeness | **Fail** |
| Hard public acceptance | **Fail** (correct) |
| Historical leak artifact deletion | **Done** |

## Remaining limitations

1. Live Cursor-run generations still omit token usage and USD cost (`provider_did_not_report`). Blocks Ready.
2. Historical TT-8 Langfuse hard-complete remains fail (documented).
3. No public harness source PR, npm publish, or tag (not authorized).

Do not open a public harness source PR, merge `feat/eval-pipeline` to a public source tree, publish npm, or tag without explicit authorization.
