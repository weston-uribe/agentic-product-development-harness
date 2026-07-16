# Canonical product-development workflow

**Status:** implemented in source (Workflow page + runner preflight)

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

## Role-based agent models

Production Workflow configuration stores authoritative model selections in `harness.config.json` under `roleModels`:

- **Planner** — planning agents
- **Builder** — implementation, revision, and integration-repair agents

The Workflow page exposes Planner and Builder controls only. There are no independent revision or integration-repair model settings.

Model changes autosave locally and sync to the harness repo cloud secret `HARNESS_CONFIG_JSON_B64` only.

## Duplicate status contract

Linear **Duplicate** is an optional system terminal status. Setup does not create it. Its absence does not block harness runs. When present, validation requires the canonical name and `canceled` category.

## Merge path variants

- **Different integration and production branches:** Ready to Merge → Merging → Merged to Dev → Merged / Deployed
- **Same branch:** Ready to Merge → Merging → Merged / Deployed

## Workflow UI

The Workflow page is cards-only (health panel + expandable workflow cards). Sidebar card expansion state is stored in browser session storage.

Legacy `/operations` routes redirect to Workflow. The retired draft API returns **410 Gone**.

## Validation

Canonical Linear workflow validation runs before authoritative runner side effects when live Linear team workflow states are available. Noncanonical `harness.config.json` workflow-status overrides are reported as configuration errors and are not silently rewritten.
