---
name: planner
description: >-
  Convert approved product intent or audit findings into implementation-ready
  plans and reviewable PR slices. Use when planning feature work or audit
  remediation before implementation runs.
---

# Planner

Convert approved product intent, Linear issues, product requests, or audit reports into implementation-ready plans and reviewable PR slices. This skill is **planning only** — it produces plans; it does not modify code, create branches, open PRs, or run implementation.

## When to use

- A Linear issue is in **Ready for Planning** and needs a durable plan before build
- An approved product request needs implementation-ready planning
- A `code-health-audit` or future audit report needs remediation planning
- Work is too large for one reviewable PR and needs ordered PR slices
- The operator wants a planner-consumable plan without implementation changes

## Skill boundaries

### Must do

- Read the available source of intent: Linear issue, product request, prior plan, or audit report
- Decide whether the work should be one PR or multiple PR slices
- Produce reviewable, implementation-ready slices with scope, acceptance criteria, validation, dependencies, and ordering
- Preserve out-of-scope boundaries from the source artifacts
- For audit remediation, prioritize Critical / High / Medium findings and usually exclude Low / Info unless explicitly requested
- Produce durable markdown suitable for a Linear plan comment or operator review

### Must not do

- Modify files, create branches, commit, open PRs, merge, deploy, or run implementation
- Fix audit findings directly
- Over-specify low-level code changes unless needed to preserve intent, constraints, or safety
- Invent product requirements or architecture direction beyond the input artifacts
- Duplicate implementation-agent responsibilities

## Relationship to other roles

| Role | Responsibility |
|------|----------------|
| **Audit skills** | Inspect and report findings |
| **This skill (planner)** | Convert intent or findings into remediation plans and reviewable PR slices |
| **Implementation agent** | Make scoped code changes on one selected slice |

Do not duplicate audit or implementation responsibilities.

## Planner modes

- **feature-planning** — Use for approved product intent or Linear issues that need a plan before build. Output one implementation plan if the work is PR-sized; otherwise apply PR slicing and output multiple ordered slices.
- **audit-remediation-planning** — Use for `code-health-audit` or future audit reports. Convert findings into prioritized remediation slices without doing the fixes.

If no mode is specified:

- Linear issue / feature request → `feature-planning`
- Audit report / finding IDs → `audit-remediation-planning`
- Explicit request to split work → infer `feature-planning` or `audit-remediation-planning` from the source, then apply PR slicing rules

## Shared capability: PR slicing

PR slicing is **not** a standalone planner mode. Apply it inside feature planning or audit-remediation planning when the work is too large for one reviewable PR.

When slicing:

- Focus on dependency order, independently reviewable scope, and validation per slice
- Each slice must have clear reviewer value and be independently testable
- Preserve ordering and dependencies explicitly
- Avoid broad "refactor everything" slices

## Inputs

Ask for or infer:

1. **Source artifact** — Linear issue, product request, prior plan, or audit report
2. **Target repo path** and branch/ref
3. **Planner mode** — `feature-planning` or `audit-remediation-planning` (infer if not specified)
4. **Scope boundaries** — include / exclude paths or subsystems
5. **Repo context** — `AGENTS.md`, README, architecture docs, `templates/implementation-plan.md`, prior plan comments
6. **Audit finding IDs** — when planning audit remediation (e.g. `CH-001`, `CH-003`)

**Sensible default:** plan from the current workspace and current branch using durable artifacts only. Do not run expensive, destructive, or long-running commands unless explicitly asked. Lightweight read-only inspection is allowed.

## PR slicing rules

- Prefer **one PR** when the work is narrow, low-risk, and reviewable as one change
- **Split** when the work crosses subsystems, mixes product and refactor work, has independent validation boundaries, or would produce a hard-to-review diff
- Each slice must have a clear user/reviewer value or maintenance outcome
- Each slice must be independently testable
- Do not mix unrelated cleanup with feature work unless the cleanup is necessary for that slice
- Avoid "prep PR" slices unless they reduce real review risk and have observable value
- Preserve ordering and dependencies explicitly
- Avoid broad "rewrite everything" recommendations

## Audit-remediation planning rules

- Consume audit findings by stable ID (`CH-001`, etc.) from `code-health-audit` or future audit skills
- Prioritize **Critical** (if emitted), then **High**, then **Medium**
- Usually **exclude Low and Info** unless the operator explicitly asks or they are bundled into a nearby higher-priority slice with minimal additional scope
- Convert findings into remediation goals and acceptance criteria, not implementation instructions
- Keep security, performance/cost, product/design, and broad architecture findings out of code-health remediation unless the operator explicitly routes them to the appropriate audit/planning workflow
- If findings require product or architecture judgment, mark them as `needs human decision` rather than planning implementation

## Output package

Produce this artifact when planning is complete. Do not create files unless the operator explicitly asks to save the plan.

Use the format matching the planner mode:

- `feature-planning` → [Feature planning output format](#feature-planning-output-format)
- `audit-remediation-planning` → [Audit remediation output format](#audit-remediation-output-format)

## Feature planning output format

```markdown
# Implementation Plan

## Source

- Issue / request:
- Target repo:
- Planner mode: feature-planning
- Recommended slice count: one PR / multiple PRs

## Context

## Scope Boundaries

### In scope

### Out of scope

## PR Slices

### Slice 1: <title>

- Goal:
- Dependencies:
- Acceptance criteria:
- Expected files / areas:
- Explicitly out of scope:
- Validation expectations:
- Implementation-agent handoff notes:

## Risks / Open Questions

## Overall Validation Plan

## Rollback / Revert Considerations
```

For a single-PR plan, include one slice. For multi-PR work, include ordered slices with explicit dependencies.

## Audit remediation output format

```markdown
# Audit Remediation Plan

## Source Audit

- Audit report:
- Findings considered:
- Findings excluded:
- Planner mode: audit-remediation-planning

## Prioritization Summary

| Finding IDs | Priority | Reason | Planned slice |
|-------------|----------|--------|---------------|

## PR Slices

### Slice 1: <title>

- Findings addressed:
- Remediation goal:
- Acceptance criteria:
- Expected files / areas:
- Explicitly out of scope:
- Validation expectations:
- Dependencies / ordering:
- Implementation-agent handoff notes:

## Deferred Findings

| Finding ID | Severity | Reason deferred |
|------------|----------|-----------------|

## Risks / Open Questions
```

## Handoff to implementation

The planner outputs one implementation-ready slice at a time or a multi-slice plan from which the operator/runner selects the next slice.

For each slice, include:

- Slice title suitable for a PR title
- Source issue/audit links
- Goal and acceptance criteria
- Expected files or areas (advisory — not rigid code edits)
- Explicit out-of-scope paths or behaviors
- Validation commands/checks
- Known risks and open questions

The planner does **not** create implementation branches or PRs. The implemented [`.agents/skills/implementation/SKILL.md`](../implementation/SKILL.md) should consume one selected slice and perform code changes.

## Planning process

1. Confirm source artifact and infer planner mode if not specified
2. Read repo instructions and relevant durable artifacts (`AGENTS.md`, issue body, audit report, prior plans)
3. Assess whether the work fits one PR or needs PR slicing
4. Produce scope boundaries, acceptance criteria, and validation per slice
5. For audit remediation, prioritize findings and defer Low/Info unless requested
6. Output the plan package and confirm no files were changed

## Relationship to runner prompts

[`src/prompts/planning.md`](../../../src/prompts/planning.md) is the SDK runner implementation detail for cloud planning phases today. It is **not** the canonical harness skill. This skill defines the durable planner workflow contract; runner prompt migration is future work.

## References

- Skill architecture: [`docs/skills/skill-architecture.md`](../../../docs/skills/skill-architecture.md)
- Implementation plan template: [`templates/implementation-plan.md`](../../../templates/implementation-plan.md)
- Code health audit skill: [`.agents/skills/code-health-audit/SKILL.md`](../code-health-audit/SKILL.md)
- Linear automation state machine: [`docs/architecture/linear-automation-state-machine.md`](../../../docs/architecture/linear-automation-state-machine.md)
- Agent guide: [`AGENTS.md`](../../../AGENTS.md)
