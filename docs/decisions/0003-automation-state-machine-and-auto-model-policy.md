# ADR 0003: Automation state machine and Auto model policy

**Status:** Accepted  
**Date:** 2026-07-06

## Decision

1. Adopt the Linear status model documented in [`docs/architecture/linear-automation-state-machine.md`](../architecture/linear-automation-state-machine.md), with **optional planning**, a **planning bypass path**, and **no Plan Review** in the default active flow.
2. Require every Cursor agent, cloud agent, and automation in this harness to use the Cursor model setting **`Auto` only** — no named models until explicitly changed in a future ADR.
3. Implement the first Cursor Automation as a **status-triggered router** that inspects issue status/labels and exits without action on unsupported states.

## Context

Linear statuses and labels were updated manually ahead of a Cursor Automations trigger spike. The previously assumed workflow included **Plan Review** as a default gate. Operational experience and spike scope require a simpler machine:

- Planning is optional; small/low-risk issues can go directly to build.
- `Plan Review` remains in Linear only as deprecated/reserved if present — not routed by automations.
- Native Cursor ↔ Linear integration was smoke-tested once ([`docs/research/002-linear-cursor-integration-smoke-test.md`](../research/002-linear-cursor-integration-smoke-test.md)); the next step is a router automation, not a full build loop.
- Model selection should not be hard-coded to named providers during early spikes; **`Auto`** is the only allowed setting so behavior can evolve with Cursor defaults.

## Rationale

1. **Optional planning reduces friction** for narrow, well-scoped work while preserving a path for high-risk or ambiguous issues via `requires-plan`.
2. **Removing Plan Review from the default path** avoids an extra human gate before the first automation spike; it may return later for high-risk work only.
3. **Router-first automation** prevents duplicate or conflicting automations when Linear fires status-change triggers broadly.
4. **`Auto`-only model policy** keeps spike prompts portable and avoids documenting provider-specific assumptions that will change.
5. **Durable context in Linear/GitHub** ensures any fresh agent can resume work without hidden session memory.

## Consequences

### Positive

- Clear contract for the Cursor Automations trigger spike
- Labels (`requires-plan`, `skip-plan`) give explicit routing hints
- Early exit on unsupported statuses limits runaway agent actions

### Negative / accepted tradeoffs

- Plan Review gate is deferred; high-risk work relies on labels and human triage until reintroduced
- First spike is planning-only or docs-only — no autonomous merge/deploy loop
- Automations that cannot use `Auto` are blocked until Cursor supports it or policy changes

## Alternatives considered

| Alternative | Why not now |
|-------------|-------------|
| Mandatory planning for all issues | Too heavy for small/docs-only work |
| Plan Review in default flow | Extra gate before spike; removed from active path |
| Separate automations per status | Broad Linear triggers cause duplicate runs |
| Named model per role (e.g. Claude for planning) | Policy lock-in; violates current harness rule |

## References

- [`docs/architecture/linear-automation-state-machine.md`](../architecture/linear-automation-state-machine.md)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`ROADMAP.md`](../../ROADMAP.md)
- [`AGENTS.md`](../../AGENTS.md)
