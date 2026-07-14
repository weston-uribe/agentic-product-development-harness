---
name: implementation
description: >-
  Execute one approved planner slice or validated issue at a time, validate it,
  and report objective results. Use for initial build, revision, or
  integration repair on a feature branch.
---

# Implementation

Execute exactly one approved implementation unit at a time, validate it, and report objective results. This skill is **code-changing execution** — it makes scoped code changes; it does not plan work, run audits, merge PRs, or wire runner automation.

## When to use

- A Linear issue is in **Ready for Build** and one planner slice or validated issue is ready for implementation
- An operator selects one slice from a planner output for implementation
- A PR needs revision from **Needs Revision** feedback on the same branch
- Merge-owned **integration repair** is required on an existing PR branch
- The operator wants scoped implementation with objective validation reporting

## Skill boundaries

### Must do

- Read one selected implementation slice from planner output, a Linear issue, or operator instruction
- Implement only that selected slice
- Preserve explicit in-scope and out-of-scope boundaries
- Make minimal, reviewable code changes
- Follow repo instructions such as `AGENTS.md`, README, architecture docs, package scripts, and local conventions
- Run appropriate validation commands and report pass / fail / not run with evidence
- Report changed files, validation results, blockers, unresolved risks, branch/PR state, and model setting when relevant
- In `revision`, address review/test feedback on the same branch without expanding scope
- In `integration-repair`, fix merge/build/test/integration failures caused by bringing branches together, preserving issue acceptance criteria plus already-merged base behavior

### Must not do

- Implement future planner slices early
- Perform unrelated cleanup
- Change acceptance criteria
- Invent product requirements
- Make broad architecture changes unless required by the selected slice and already approved
- Merge PRs unless explicitly instructed
- Delete or overwrite untracked/local files unless explicitly instructed
- Silently ignore failing validation
- Convert this skill into runner integration, provider automation, registry logic, or client adapter behavior
- Decide whether work should be split into PRs or reprioritize planner slices
- Publish npm packages, create git tags, create GitHub releases, or deploy without explicit human authorization
- Override planner-supplied release boundaries when the plan marks release preparation as human-gated

When the approved plan includes release-impact notes, preserve those boundaries and report any outstanding release preparation in the run report. Do not treat implementation completion as release readiness.

## Relationship to other roles

| Role | Responsibility |
|------|----------------|
| **Audit skills** | Inspect and report findings |
| **Planner** | Convert intent or findings into remediation plans and reviewable PR slices |
| **This skill (implementation)** | Make scoped code changes on one selected slice |
| **Handoff / merge runners** | PR inspect, preview capture, merge, and status transitions |

Do not duplicate planner, audit, or merge responsibilities.

## Implementation modes

This skill uses **code-changing execution**, with three internal modes:

- **initial-build** — Implement one selected planner slice or validated direct-build issue. Create or update a feature branch and open a PR when instructed by the runner/operator.
- **revision** — Apply PM/review/test feedback on the **same branch and existing PR** without expanding scope.
- **integration-repair** — Repair merge/build/test/integration failures on the **existing PR branch** during merge-owned repair. Preserve issue acceptance criteria plus already-merged base behavior.

Revision and integration repair are **modes of the same implementation agent**, not separate agents.

If no mode is specified:

- Ready for Build / new slice selected → `initial-build`
- Needs Revision / review feedback on existing PR → `revision`
- Merge-owned behind/dirty/conflict repair on existing PR branch → `integration-repair`

## Inputs

Ask for or infer:

1. **Selected slice or issue** — one planner slice, Linear issue body, or operator instruction
2. **Implementation mode** — `initial-build`, `revision`, or `integration-repair`
3. **Target repo path**, base branch, and branch/PR instructions
4. **Scope boundaries** — acceptance criteria, out-of-scope paths, planner handoff notes
5. **Repo context** — `AGENTS.md`, README, architecture docs, prior plan comments, durable markers
6. **Feedback source** — PM feedback, review comments, failing checks (revision mode)
7. **Repair context** — conflict files, base branch delta, existing PR metadata (integration-repair mode)
8. **Validation commands** — from slice, issue, harness config, or package scripts

**Sensible default:** reconstruct context from durable artifacts only (Linear comments, GitHub PR/branch, issue body, planner output). Do not rely on hidden session memory.

## How to consume planner output

- Read **exactly one** selected slice from a planner plan unless the operator explicitly selects multiple slices
- Carry forward slice title, source issue/audit links, goal, acceptance criteria, expected files/areas, explicit out-of-scope boundaries, validation expectations, dependencies, and handoff notes
- Treat expected files/areas as advisory; acceptance criteria and boundaries are authoritative
- If no planner output exists because the issue uses the bypass path, consume the validated Linear issue body and acceptance criteria directly
- If the selected slice is ambiguous, stop for clarification rather than planning new scope

## How to avoid planner work

- Do not decide whether the overall work should be split into PRs
- Do not reprioritize slices or rewrite acceptance criteria
- Do not convert audit findings into remediation plans
- Do not create a new implementation plan unless the operator explicitly asks for planning instead of implementation
- Escalate unclear product or architecture decisions back to the operator/planner

## Initial-build workflow

1. Confirm implementation mode is `initial-build`
2. Run worktree and branch hygiene checks (below)
3. Read the selected slice or validated issue and durable plan comment if present
4. Implement only the selected slice with minimal, reviewable changes
5. Run appropriate validation commands
6. Create or update branch/PR only when instructed by runner/operator
7. Produce the implementation report package

## Revision workflow

1. Confirm implementation mode is `revision`
2. Run worktree and branch hygiene checks (below)
3. Read the existing branch, PR, original issue/slice boundaries, and feedback source
4. Apply **only** the requested feedback on the same branch
5. Do not open a new PR
6. Run appropriate validation commands
7. Produce the revision report package with branch and PR unchanged except for new commits

## Integration-repair workflow

1. Confirm implementation mode is `integration-repair`
2. Run worktree and branch hygiene checks (below)
3. Start from the existing PR branch only
4. Perform base-into-head conflict repair when required:
   - Fetch latest base branch
   - Merge base into PR branch locally
   - Resolve conflicts; preserve issue acceptance criteria and already-merged base behavior
5. Edit only conflict files and direct dependency-closure files required to compile and pass validation
6. Do not push to base, production, `main`, or `dev` branches directly
7. Run validation before pushing the repaired PR branch
8. If repair requires broader product judgment, stop and report `requires_product_judgment`
9. Produce the repair report package with repair evidence

## Worktree and branch hygiene

This is the first canonical skill that allows repo mutation. Git state hygiene is required.

Before making changes:

- Confirm the current branch and intended target branch
- Inspect working tree status
- Identify untracked files and unrelated local changes
- Do not overwrite, delete, stage, or commit unrelated local work
- If unrelated local changes could conflict with the selected slice, stop and report the blocker
- Keep commits limited to the selected implementation unit
- If creating or updating a PR is part of the runner/operator instruction, report the final branch and PR state clearly

## Scope-control rules

- One selected planner slice or one validated direct-build issue is the implementation unit
- Do not implement later slices, even if adjacent code makes them tempting
- Do not add broad cleanup, formatting sweeps, new abstractions, or architecture changes unless required by the selected slice
- Do not touch unrelated target repos or local untracked files
- In revision mode, the feedback source is the only scope expansion allowed
- In integration repair, preserve both current issue acceptance criteria and behavior already merged into the base branch
- Stop and report when the requested fix requires product or architecture judgment beyond the approved slice

## How to avoid broad audit or architecture work

- Treat audit findings as input only after a planner slice selects them for remediation
- Do not run broad code-health, security, performance/cost, or architecture audits as part of implementation
- Note incidental out-of-scope observations separately, but do not fix them
- If implementation reveals architecture risk outside the selected slice, report it as residual risk rather than expanding the diff

## Validation rules

- Read validation expectations from the selected slice, Linear issue, harness config, package scripts, and local conventions
- Prefer existing package scripts and repo-specific checks over invented commands
- Run focused checks when available; broaden to full tests/build when shared behavior or user-facing workflows are touched
- For UI work, include manual or browser/preview verification when available
- Report every check as pass, fail, or not run with evidence
- Do not silently ignore failing validation; either fix in scope or report the blocker
- Do not claim readiness when required checks were not run
- For integration repair, validation must show conflict resolution compiles/passes relevant checks before returning to merge

## UI / design standards

Reference UI/design standards only when the selected slice touches UI or product experience and when relevant docs already exist in the target repo. Do not create a standalone UI/design skill or new standards document as part of this skill. UI/design standards remain a likely implementation **reference**, not a top-level skill.

## Output package

Produce this artifact when implementation is complete. Do not create files unless the operator explicitly asks to save the report.

Use the [report format](#report-format) below. For `integration-repair`, include the repair evidence section.

## Report format

```markdown
# Implementation Report

## Source

- Issue / request:
- Planner slice:
- Target repo:
- Mode: initial-build / revision / integration-repair
- Branch:
- PR:

## Completed Actions

- ...

## Scope Check

- Selected slice / feedback addressed:
- Explicitly out of scope preserved:
- Future slices not implemented:
- Local/untracked files preserved:

## Changed Files

- `path`: reason

## Validation Results

| Check | Result | Evidence |
|-------|--------|----------|
| ... | Pass / Fail / Not run | ... |

## Blockers / Deviations

- ...

## Risks / Open Questions

- ...

## Handoff

- PR URL:
- Final branch SHA:
- Model setting, when relevant:
```

For `integration-repair`, add:

```markdown
## Repair Evidence

- Deterministic update result:
- Conflict-resolution summary:
- Touched-file rationale:
- Final PR branch SHA:
- Repair status: success / failed / ambiguous / requires_product_judgment
```

Follow the agent reporting contract in [`AGENTS.md`](../../../AGENTS.md): objective evidence, changed files, validation results, blockers, and repair evidence when applicable.

## Relationship to runner prompts

SDK runner prompts are implementation details for cloud agent phases today. They are **not** the canonical harness skill:

- [`src/prompts/implementation.md`](../../../src/prompts/implementation.md) — initial build
- [`src/prompts/revision.md`](../../../src/prompts/revision.md) — revision
- [`src/prompts/integration-repair.md`](../../../src/prompts/integration-repair.md) — integration repair

This skill defines the durable implementation workflow contract. Runner prompt migration is future work.

## References

- Skill architecture: [`docs/skills/skill-architecture.md`](../../../docs/skills/skill-architecture.md)
- Planner skill: [`.agents/skills/planner/SKILL.md`](../planner/SKILL.md)
- Integration repair: [`docs/integration-repair.md`](../../../docs/integration-repair.md)
- Linear automation state machine: [`docs/architecture/linear-automation-state-machine.md`](../../../docs/architecture/linear-automation-state-machine.md)
- PR readiness template: [`templates/pr-readiness-report.md`](../../../templates/pr-readiness-report.md)
- Eval scorecard template: [`templates/eval-scorecard.md`](../../../templates/eval-scorecard.md)
- Agent guide: [`AGENTS.md`](../../../AGENTS.md)
