# Issue: [Short title]

Assign the issue to a **mapped Linear project** (e.g. Portfolio) when possible. Routing is controlled by the **Linear status field** (e.g. Ready for Planning, Ready for Build), not by any section in this description.

> `## Problem` is a parser fallback for `## Task`; prefer `## Task` for new issues.

## Target repo

owner/repo

_Include when known. May be copied from Linear project metadata (`Harness metadata: Target repo: ...`) or omitted when the issue is assigned to a mapped Linear project._

## Task

Single clear objective in one or two sentences.

## Acceptance criteria

- [ ] Observable, testable outcome 1
- [ ] Observable, testable outcome 2

## Out of scope

- Explicitly excluded work

## Validation expectations

- `npm run lint`
- `npm run build`

## Context and links

- Related issues / PRs:
- Design or research links:
- Target repo: `owner/repo` (optional backup if `## Target repo` is omitted)

## User / job story

As a **[persona]**, I want **[capability]** so that **[outcome]**.

## Eval hints

| Criterion | Priority |
|-----------|----------|
| Matches acceptance criteria | Required |
| No unrelated file changes | Required |

## Definition of ready

- [ ] Task and acceptance criteria are clear
- [ ] Out of scope is documented
- [ ] Linear project assigned (or target repo identified)
- [ ] PM / owner assigned for review
