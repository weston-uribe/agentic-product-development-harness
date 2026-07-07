---
name: issue-intake
description: >-
  Turn a fuzzy product idea into a harness-compatible Linear issue. Use when
  starting new harness work, drafting Linear issues, or validating issue
  readiness before planning or implementation.
---

# Issue intake

Turn a fuzzy product idea into a harness-compatible Linear issue. Routing is controlled by the **Linear status field**, not by any section in the issue description.

## When to use

- Starting new harness work from an unstructured idea (in Cursor)
- Re-intaking or refining a draft issue before validation
- Operator-assisted intake when ChatGPT is not available

For PM self-service intake, use the canonical ChatGPT prompt — see [ChatGPT path](#chatgpt-path) below.

## Intake rules

### Upfront form (default)

Ask for **all fields in one message**:

1. **Linear project** (primary) — e.g. Portfolio, Agentic Product Development Harness
2. **Target repo** (optional override) — only when project metadata does not include `Harness metadata: Target repo: ...`
3. Desired outcome
4. Current problem / current behavior
5. Requested change
6. Acceptance criteria or observable success
7. Out of scope / what not to change
8. Validation expectations (optional — "none known" OK)
9. Initial Linear status preference: Backlog | Ready for Planning | Ready for Build | Draft only

**Defaults:** status → Backlog; do not finalize for Linear paste until the operator approves the package.

### Follow-up questions

Ask follow-ups **only** when required information is missing or ambiguous. Do not interview one question at a time by default.

### Synthesis

Combine fields 2–4 into `## Task`. Put measurable outcomes in `## Acceptance criteria`. Put boundaries in `## Out of scope`.

### Push back

Stop and narrow when: multi-repo scope, security/auth/payments, vague AC, no observable success, or AC count likely >7 without planning.

## Status recommendation

Recommend **Linear status** (not a description section):

| Condition | Recommended status |
|-----------|-------------------|
| Blocking questions remain | Backlog |
| User chose Draft only | Package only |
| Structurally incomplete | Backlog |
| Narrow + low-risk (task ≤240 chars, AC ≤7) | Ready for Build only after operator confirms |
| Broad, ambiguous, cross-cutting, or high-risk | Ready for Planning or Backlog |
| Default | Backlog |

**Never** recommend Ready for Build for broad or ambiguous work.

### Labels (optional)

Use only **existing** WES team labels. Suggest: `portfolio` / `harness` by project; `requires-plan` + `planning-agent` for Ready for Planning; `skip-plan` + `implementation-agent` for Ready for Build; `Feature`/`Improvement`/`Bug` when obvious. Runner does not enforce labels.

### Project metadata

Read Linear project description for:

```text
Harness metadata:
Target repo: owner/repo
```

Copy derived repo into `## Target repo` in the issue description.

## Narrow-issue thresholds (build-direct)

Direct implementation without a prior planning run requires:

- Task body ≤ 240 characters
- Acceptance criteria ≤ 7 hyphen bullets
- Low-risk, clear scope

See [`src/validate/constants.ts`](../../src/validate/constants.ts) for canonical values. Full rules in [`prompts/issue-intake-chatgpt.md`](../../prompts/issue-intake-chatgpt.md).

## Output package

Produce this artifact when intake is complete:

```markdown
## Linear issue package

**Title:** ...
**Linear project:** ...
**Recommended status:** Backlog | Ready for Planning | Ready for Build
**Optional labels:** ... (or "none")
**Target repo:** owner/repo (derived or override)

### Readiness assessment
- Valid for planning: yes/no — reason
- Valid for direct implementation: yes/no — reason

### Blocking questions
- ... (or "none")

### Linear description (copy-paste)
<paste-ready markdown matching description contract>
```

Apply the readiness assessment algorithm from [`prompts/issue-intake-chatgpt.md`](../../prompts/issue-intake-chatgpt.md).

## Description contract

Required sections (level-2 headers, case-insensitive):

- `## Target repo` — include when known; may be derived from Linear project metadata
- `## Task` (preferred; `## Problem` is a parser fallback)
- `## Acceptance criteria` — at least one `-` bullet
- `## Out of scope` — at least one `-` bullet

Optional: `## Validation expectations`, `## Context and links`, `## User / job story`, `## Eval hints`, `## Definition of ready`

Authoritative copy: [`prompts/issue-intake-chatgpt.md`](../../prompts/issue-intake-chatgpt.md)

## ChatGPT path

PMs copy the canonical prompt into a normal ChatGPT thread:

1. Open [`prompts/issue-intake-chatgpt.md`](../../prompts/issue-intake-chatgpt.md) and copy the entire file into ChatGPT
2. Answer the upfront intake form; review the issue package
3. Approve creation; ChatGPT creates via Linear access if available, otherwise copy-paste into Linear
4. Operator optionally validates live issues with CLI (below)

Deferred Custom GPT setup: [`gpt/issue-intake/setup-guide.md`](../../gpt/issue-intake/setup-guide.md)

## Cursor validation path

After producing or pasting a description, instruct the operator to run route-specific validation:

```bash
# Recommended Ready for Planning
npm run harness:validate-issue -- --file <draft.md> --intended-phase planning

# Recommended Ready for Build
npm run harness:validate-issue -- --file <draft.md> --intended-phase implementation

# General check (both routes reported; exit 0 if planning-valid)
npm run harness:validate-issue -- --file <draft.md>
```

After paste to Linear:

```bash
npm run harness:validate-issue -- --issue TEAM-XX --intended-phase planning
# or
npm run harness:validate-issue -- --issue TEAM-XX --intended-phase implementation
```

## References

- Canonical ChatGPT prompt: [`prompts/issue-intake-chatgpt.md`](../../prompts/issue-intake-chatgpt.md)
- Deferred GPT package: [`gpt/issue-intake/`](../../gpt/issue-intake/)
- Template: [`templates/linear-issue.md`](../../templates/linear-issue.md)
- Operator guide: [`docs/issue-intake.md`](../../docs/issue-intake.md)
- Examples: [`skills/issue-intake/examples.md`](examples.md)
