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

## Skills

Phase prompts render canonical skills via `injectPhaseSkills`. Provenance records `inclusionMethod=rendered_into_prompt` or `skillProvenanceStatus=none`.

## Out of scope (later)

Dataset promotion, experiment runner, dashboards, LLM judges.
