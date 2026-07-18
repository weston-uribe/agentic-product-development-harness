# ADR 0007: Modular workflow state machine

**Status:** Accepted (Chunk 4 foundation; Chunk 5 Plan Review loop)  
**Date:** 2026-07-18

## Context

Status routing was scattered across phase runners (`getTransitionalStatus` + hardcoded next statuses), reconcile modules, and GUI copy. Future optional Plan Review and Code Review agents need a reusable, provider-neutral workflow architecture without inventing per-phase `if` chains.

## Decision

### Why declarative

The product-development lifecycle is declared as a versioned workflow definition (`product-development-v2`) with phases, statuses, transitions, loop counters, and role bindings. Executable business logic stays in TypeScript modules (transition engine, reconcile adapters, runners) — not arbitrary config strings.

### Source-of-truth hierarchy

1. **Workflow definition** (versioned code + config) — legal transitions and role bindings
2. **Authoritative issue-scoped `WorkflowStateRecord`** — accepted phase/decision/counters/generations with monotonic `stateRevision`
3. **Live Linear issue status + GitHub/run evidence** — external facts validated on every mutation
4. **Run manifests / Linear markers / status comments** — immutable snapshots or references only; must not independently advance workflow state
5. **Webhook/dispatch payloads** — hints only; never authorize transitions

### Atomic mutation protocol

Every state mutation must:

1. Read the latest authoritative state
2. Validate current Linear status and durable GitHub/run evidence
3. Include `expectedStateRevision`
4. Apply via compare-and-set **or** reject as stale/conflict
5. Increment `stateRevision` exactly once on accept
6. Use a deterministic transition/idempotency identity
7. Preserve monotonic counters and completed-phase evidence

When the backing store cannot provide true CAS, use bounded conflict detection with reread/retry (`stale_state` / `conflict_exhausted`).

### Status / phase / role separation

These identities are not interchangeable:

| Concept | Example |
|---------|---------|
| Linear status | `Building` |
| Workflow phase | `implementation` |
| Agent role | `builder` |
| Prompt role | `implementer` |
| Model role | `builder` |

Future `plan_reviewer` / `code_reviewer` roles do not require sharing names with statuses or prompts.

### Transition evaluation

`evaluateTransition` is the single evaluator for claim/success/failure/human/review/infra-retry outcomes. Phase runners resolve next statuses through this engine rather than inventing routing.

### Optional phases

Optional phases declare `enabledBy`, `bypassNext`, and do not require Linear statuses until enabled. When disabled:

- No agent run or Langfuse trace
- Bounded `phase_bypassed` event
- Continue to bypass destination
- No fake success scores

Defaults: `planReview=false`, `codeReview=false` — current paths unchanged.

### Review loops

Reusable `ReviewOutcome` / `ReviewDecision` contracts support approved, needs_revision, return-to-review, independent cycle counters, max escalation (no auto-approve), duplicate decision protection, and stale generation rejection. Reviewer agents are **not** implemented in this ADR’s chunk.

### Cycle limits

Counters are issue-scoped inside `WorkflowStateRecord`. Infrastructure retries, duplicate deliveries, and stale generations do not increment review counters. Plan-review and code-review counters are independent.

### Reconciliation

`resolveRoute` and reconcile CLIs read live Linear/GitHub evidence plus authoritative workflow state. Specialized revision/merge evaluators remain evidence adapters. The workflow definition determines eligibility shape; payloads do not.

### Linear migration

`workflow-status-report` produces a dry-run requirement report (missing/extra/category mismatches). It does not create or modify live statuses. Optional review statuses appear in the report only when enabled.

### Fail-closed Plan Review activation (Chunk 5)

Separate:

| Flag | Meaning |
|------|---------|
| `requestedEnabled` | `workflow.optionalPhases.planReview === true` |
| `effectiveEnabled` | Safe to execute: Linear Plan Review status present with required category, definition/prompt/skill/model valid, runner schema supported |

Until effective:

- Persist requested setting; GUI shows **Enabled — setup required** with exact missing requirements
- Production route remains **Planning → Ready for Build**
- No missing-status transition, no reviewer agent, no Plan Review trace/score
- Emit bounded `p_dev_plan_review_readiness` diagnostic (not a false preference-driven bypass)

Freeze **`effectiveEnabled`** (plus requested, cycle limit, model) into each claimed phase execution. Readiness/config changes apply only to subsequent claims.

### Plan Review lifecycle (when effective)

```text
Planning → Plan Review
  approved        → Ready for Build
  needs_revision  → Ready for Planning → Planning → Plan Review
  cycle limit     → Blocked (no auto-approve)
```

Default max cycles: **4**. Revision increments `plan_review_cycles` once; infra/duplicate/stale do not.

### Materiality and independence

Blocking findings only for meaningful risk (wrong behavior, missing outcome, unsafe migration, unverifiable acceptance, arch/security/privacy, material ambiguity). Style-only notes are nonblocking. Reviewer is a fresh agent with bounded context; harness owns status transitions.

### Plan artifact identity

Every plan generation persists `planGenerationId`, `planArtifactHash`, planner run id, prompt contract version, workflow-state revision, timestamps, and supersession links. Reviews must match harness evidence; model-claimed identity is insufficient.

### Mid-cycle configuration

Disabling Plan Review mid-cycle does not silent-bypass an active claimed reviewer. Final deployment cycle promotes requested → effective after Linear status migration and runner compatibility checks (out of Chunk 5 freeze for live migration).

### Extension procedure (Code Review)

Reuse the same pattern: optional phase + readiness gate + `ReviewOutcome` + independent counter + GUI three-state card. Do not invent parallel routing.

## Consequences

- Current workflow behavior is preserved when Plan Review is not effectively enabled
- GUI shows Plan Review as Disabled / Setup required / Active
- Markers/manifests become snapshots referencing `stateRevision` / transition identity
- Concurrent webhook/reconcile races are handled by atomic apply + bounded retry
