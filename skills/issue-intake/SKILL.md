---
name: issue-intake
description: >-
  Interview Weston to turn a fuzzy product idea into a harness-compatible
  Linear issue. Use when starting new harness work, drafting Linear issues,
  or validating issue readiness before planning/implementation.
---

# Issue intake

Turn a fuzzy product idea into a harness-compatible Linear issue. Routing is controlled by the **Linear status field**, not by any section in the issue description.

## Interview rules

1. **Interview mode** — one focused question at a time; no solutioning until system, desired outcome, and active constraint are clear
2. **Clarify** — system (which repo/product), outcome (observable), constraint (time/risk/scope boundary)
3. **Push back** — stop and narrow when: multi-repo, security/auth/payments, vague AC, no observable success, or AC count likely >7
4. **Route recommendation** — recommend **Linear status** (not a description section):
   - `Backlog` — idea not ready; open questions remain
   - `Ready for Planning` — broad, ambiguous, cross-cutting, or high-risk
   - `Ready for Build` — narrow, low-risk, clear AC (≤7 bullets, task ≤240 chars)
5. **Labels (operational, non-required)** — suggest e.g. `requires-plan`, `skip-plan`, `harness`, target repo id — clearly marked optional
6. **Self-check** — before finalizing, instruct operator to run route-specific validation:
   - Recommended **Ready for Planning** → `npm run harness:validate-issue -- --file <draft.md> --intended-phase planning`
   - Recommended **Ready for Build** → `npm run harness:validate-issue -- --file <draft.md> --intended-phase implementation`
   - Unsure / general check → omit `--intended-phase` (reports both routes; exit 0 if planning-valid)
   - After paste to Linear → repeat with `--issue WES-XX` and the same `--intended-phase`

## Narrow-issue thresholds (build-direct)

Direct implementation without a prior planning run requires:

- Task body ≤ 240 characters
- Acceptance criteria ≤ 7 hyphen bullets

See [`src/validate/constants.ts`](../../src/validate/constants.ts) for canonical values.

## Output package

Produce this artifact when intake is complete:

```markdown
## Linear issue package

**Title:** ...
**Recommended status:** Backlog | Ready for Planning | Ready for Build
**Recommended labels (operational, optional):** ...
**Target repo:** owner/repo or https URL

### Reasoning
Why plan-first vs build-direct (reference narrow thresholds).

### Open questions (block creation if any)
- ...

### Linear description (copy-paste)
<paste-ready markdown matching templates/linear-issue.md>
```

## Description contract

Required sections (level-2 headers, case-insensitive):

- `## Target repo`
- `## Task` (preferred; `## Problem` is a parser fallback)
- `## Acceptance criteria` — at least one `-` bullet
- `## Out of scope` — at least one `-` bullet

Optional: `## Validation expectations`, `## Context and links`, `## User / job story`, `## Eval hints`, `## Definition of ready`

## References

- Template: [`templates/linear-issue.md`](../../templates/linear-issue.md)
- Operator guide: [`docs/issue-intake.md`](../../docs/issue-intake.md)
- Repo mappings: [`harness.config.json`](../../harness.config.json)
- Examples: [`skills/issue-intake/examples.md`](examples.md)
