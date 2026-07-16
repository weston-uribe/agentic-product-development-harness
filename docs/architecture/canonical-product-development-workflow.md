# Canonical product-development workflow

**Status:** implemented in source (Operations V2 + runner preflight)

The harness uses one canonical Linear workflow descriptor for product-development work. The descriptor lives in `src/workflow/canonical-product-development-workflow.ts` and contains product semantics only (status names, categories, roles, transitions, merge-path variants, and agent-phase keys).

## Dispatch triggers

Exactly five Linear statuses trigger repository dispatch:

- Ready for Planning
- Ready for Build
- PR Open
- Needs Revision
- Ready to Merge

## Human gates

- **Backlog** → Ready for Planning or Ready for Build
- **PM Review** → Needs Revision or Engineering Review
- **Engineering Review** → Needs Revision or Ready to Merge (human gate only; no PR review agent)

## Agent phases with draft model settings

Operations stores draft-only model selections keyed by agent phase:

- planning
- implementation
- revision
- merge-integration-repair

Draft model choices are not active runtime settings unless a future activation path is implemented and validated separately.

## Duplicate status contract

Linear **Duplicate** is an optional system terminal status. Setup does not create it. Its absence does not block harness runs. When present, validation requires the canonical name and `canceled` category.

## Merge path variants

- **Different integration and production branches:** Ready to Merge → Merging → Merged to Dev → Merged / Deployed
- **Same branch:** Ready to Merge → Merging → Merged / Deployed

## Operations V2 draft

Persisted Operations drafts (schema version 2) store:

- node layout keyed by canonical status keys
- draft model settings keyed by canonical agent-phase keys
- viewport metadata

Sidebar card expansion state is stored in browser session storage, not the draft JSON.

## Validation

Canonical Linear workflow validation runs before authoritative runner side effects when live Linear team workflow states are available. Noncanonical `harness.config.json` workflow-status overrides are reported as configuration errors and are not silently rewritten.
