# Skills

Cursor skills and other encoded workflows for the harness.

## Implemented

### issue-intake

[`issue-intake/SKILL.md`](issue-intake/SKILL.md) — conversational intake that produces a harness-compatible Linear issue package. Use before planning or implementation runs in Cursor.

For PM self-service in ChatGPT, copy the canonical prompt at [`prompts/issue-intake-chatgpt.md`](../prompts/issue-intake-chatgpt.md) into a normal chat thread. A deferred Custom GPT package exists at [`gpt/issue-intake/`](../gpt/issue-intake/).

See [`docs/issue-intake.md`](../docs/issue-intake.md) for the operator workflow and [`docs/milestones/m7-issue-intake.md`](../docs/milestones/m7-issue-intake.md) for milestone scope.

## When to add more skills

Add a skill only when all of the following are true:

1. The workflow has been completed manually at least twice
2. The steps are documented in templates or `docs/research/`
3. ROADMAP phase allows automation for that step
4. A human PM has signed off on encoding the workflow

## Planned examples (not implemented)

- PR readiness report generation from a diff
- Target-repo-specific context loading

See [`ROADMAP.md`](../ROADMAP.md) for phased delivery.
