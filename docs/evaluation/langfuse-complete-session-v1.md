# Langfuse Complete Session v1

Provider-neutral observability contract with human-readable Linear issue identity and a replaceable Langfuse projection.

## Hierarchy

| Level | Identity |
|-------|----------|
| Session | Deterministic hash ID + display metadata `linearIssueKey` / session name (e.g. `FRE-3`) |
| Phase trace | Display name `{issue} · {phase}` (revision: `{issue} · revision · cycle N`) |
| Agent observation | Only when a Cursor agent runs: `{issue} · planner\|implementer\|reviser\|integration_repairer` |
| Aggregate generation | `{issue} · {role} · Cursor run` with `usageAggregation=cursor_run_aggregate` |

Handoff and merge are orchestration traces (no agent) unless a model is actually invoked.

`integration_repair` uses its **own** phase trace under the issue session.

## Maintainer commands

```bash
npm run evaluation:inspect-langfuse -- --issue FRE-3
npm run evaluation:reproject-langfuse -- --issue FRE-3            # dry-run
npm run evaluation:reproject-langfuse -- --issue FRE-3 --apply
```

Optional Actions workflow: `.github/workflows/evaluation-inspect-langfuse.yml`.

## Capture profiles

| Profile | Langfuse bodies |
|---------|-----------------|
| `metadata-v1` | Hashes, refs, provenance, usage, cost fields |
| `content-v1` | Above + bounded redacted prompt/output (fail closed) |

## Cost

Every generation exposes `costSource`, numeric `costUsd` when trustworthy, otherwise `costUnavailableReason`, plus model ID and token categories. Pricing registry is modular (`src/evaluation/telemetry/pricing-registry.ts`); Composer 2.5 has no approved entry.

### Composer 2.5 cost investigation (evidence)

| Check | Result |
|-------|--------|
| Cursor `runs/.../cursor/run-result.json` fields | Usage tokens may be present (`inputTokens` / `outputTokens` / `totalTokens`); no trustworthy `cost` / `totalCost` / billing USD field observed on FRE-3 artifacts |
| Cursor SDK / run-result cost | Provider does not report per-run USD for Composer 2.5 in the harness adapter path |
| Pricing registry (`PRICING_REGISTRY_VERSION=2026-07-18.v1`) | Empty by design — no operator-approved Composer 2.5 rates |
| Final generation cost record | `costSource=unavailable` + `costUnavailableReason=missing_pricing_entry` when tokens exist; never a blank cost record |

Numeric USD remains unavailable until an approved registry entry or provider-reported cost exists.

## Skills

Phase prompts render canonical skills via `injectPhaseSkills`. Provenance records `inclusionMethod=rendered_into_prompt` or `skillProvenanceStatus=none`.

Historical reprojection (e.g. FRE-3) reads `evaluation/agent-telemetry.jsonl` when present; otherwise emits `skillsUsed=[]` / `skillProvenanceStatus=none`. Inspect fails (`false_skill_provenance`) if a reprojected observation claims skill usage without matching artifact evidence.

## Managed-runner reconciliation (p-dev-harness)

Conflict that blocked `release:sync-managed-runner` at `verify_main_baseline`:

| Path | Previous marker | Packaged snapshot | Remote `main` | Classification |
|------|-----------------|-------------------|---------------|----------------|
| `.github/workflows/evaluation-inspect-langfuse.yml` | absent | present (source) | present (private commits) | **operator_conflict** — private-only add after last packaged upgrade |

Private commits on `weston-uribe/p-dev-harness` (newest first), each changing **only** the diagnostic workflow path:

| SHA | Parent | Files | Decision |
|-----|--------|-------|----------|
| `807721f` | `ced24c9` | `.github/workflows/evaluation-inspect-langfuse.yml` | Absorb into source: apply `|| true`, `sleep 20` ingest wait, post-inspect `tee` |
| `ced24c9` | `7af4094` | same path | Absorb: non-hidden `runs/evaluation-reports` (already in source `f2add55`) |
| `7af4094` | `9eac585` | same path (added) | Canonical form lives in source; must leave remote before sync |

Remote-only temporary pattern (checkout harness source via `harness_ref` + `HARNESS_GITHUB_TOKEN`) is **not** absorbed — after sync the managed runner carries Complete Session tooling and self-checkouts.

Absorbed into source workflow: non-hidden report path, reproject-apply `|| true`, ingest wait, post-apply inspect with `tee`.

Also packaged: `.github/workflows/evaluation-canary-langfuse-projection.yml` + `npm run evaluation:canary-langfuse-projection`.

### Managed eval cloud config (names only)

Verified present on `weston-uribe/p-dev-harness`:

| Kind | Names |
|------|-------|
| Secrets | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `HARNESS_GITHUB_TOKEN`, `HARNESS_CONFIG_JSON_B64` |
| Variables | `LANGFUSE_BASE_URL`, `LANGFUSE_TRACING_ENVIRONMENT`, `P_DEV_EVALUATION_PROVIDER`, `P_DEV_EVALUATION_CAPTURE_PROFILE`, `P_DEV_EVALUATION_NAMESPACE`, `HARNESS_CONFIG_FINGERPRINT` |

Capture profile: keep dogfood `content-v1` only when the privacy/redaction gate passes; otherwise fail closed to `metadata-v1`.

## Next-dogfood Langfuse acceptance checklist

Ready for one fresh Linear issue through planning → implementation → PM review → ≥1 revision → merge to dev. Inspect in Langfuse:

- Human-readable Linear issue identity
- Planning trace
- Planner agent
- Implementation trace
- Implementer agent
- Handoff orchestration trace
- Revision trace
- Reviser agent
- Merge orchestration trace
- Actual safe prompt input
- Actual safe model output
- Prompt provenance
- Truthful skill provenance
- Model and token usage
- Numeric cost or explicit unavailable reason
- Phase success scores
- Terminal issue outcome scores
- One issue session across all phases

Do not create that Linear issue from this workstream.

## Out of scope (later)

Dataset promotion, experiment runner, dashboards, LLM judges.
