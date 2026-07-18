# ADR 0007: Modular workflow state machine

**Status:** Accepted (Chunk 4 — foundation)  
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

### Extension procedure (next chunks)

To add Plan Reviewer or Code Reviewer **without changing the transition engine**:

1. Enable the optional phase in config (`optionalPhases.planReview` / `codeReview`)
2. Ensure Linear statuses exist (via a later deployment cycle using the dry-run report)
3. Implement the reviewer agent + prompt/skill slots already reserved in Chunk 3
4. Emit `ReviewOutcome` into `evaluateTransition` / `applyWorkflowTransition`
5. Wire observability using existing allowlisted workflow metadata keys

Do not add special-case status routing in phase files.

## Consequences

- Current workflow behavior is preserved with optional reviewers disabled
- GUI ownership columns derive from the shared definition; unfinished controls stay hidden
- Markers/manifests become snapshots referencing `stateRevision` / transition identity
- Concurrent webhook/reconcile races are handled by atomic apply + bounded retry
