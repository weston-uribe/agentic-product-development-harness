# Skills

Cursor skills and other encoded workflows for the harness.

## v0.1 status: intentionally empty

Skills are **deferred** until a manual workflow has been run multiple times and the steps are proven worth encoding.

Creating skills too early:

- Locks in unvalidated assumptions
- Makes debugging harder when the loop changes
- Overstates harness maturity publicly

## When to add a skill

Add a skill only when all of the following are true:

1. The workflow has been completed manually at least twice
2. The steps are documented in templates or `docs/research/`
3. ROADMAP phase allows automation for that step
4. A human PM has signed off on encoding the workflow

## Planned examples (not implemented)

- Issue → implementation plan bootstrap
- PR readiness report generation from a diff
- Portfolio-specific context loading

See [`ROADMAP.md`](../ROADMAP.md) v1.0 for when reusable skills become a deliverable.
