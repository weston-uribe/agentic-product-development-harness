# Issue intake

How to turn a fuzzy product idea into a harness-compatible Linear issue before planning or implementation runs.

## When to use

- Starting new harness work from an unstructured idea
- Drafting a Linear issue description
- Checking whether an issue is ready for **Ready for Planning** or **Ready for Build**

## Paths

### ChatGPT copy-paste prompt (primary PM UX)

Product managers draft issues in a **normal ChatGPT thread**—no Custom GPT required:

1. Open [`prompts/issue-intake-chatgpt.md`](../prompts/issue-intake-chatgpt.md)
2. Copy the **entire file** into a new ChatGPT conversation
3. Answer the upfront intake form (eight fields in one reply when possible)
4. Review the **Linear issue package** and readiness assessment
5. Approve creation; ChatGPT creates the issue if Linear access is available in that thread, otherwise copy-paste into Linear manually
6. Set the **status** field on the issue per the recommendation (not in the description)
7. Operator optionally validates the live issue with CLI (below)

### Cursor skill + CLI (operator path)

1. Invoke the **issue-intake** skill in Cursor ([`skills/issue-intake/SKILL.md`](../skills/issue-intake/SKILL.md))
2. Answer the upfront intake form (same eight fields as the ChatGPT prompt)
3. Save the description to a draft markdown file
4. Validate with route-specific flags:

```bash
# Recommended Ready for Planning
npm run harness:validate-issue -- --file draft.md --intended-phase planning

# Recommended Ready for Build (fails if issue is too broad)
npm run harness:validate-issue -- --file draft.md --intended-phase implementation

# General check (both routes reported; exit 0 if planning-valid)
npm run harness:validate-issue -- --file draft.md
```

5. Paste the description into Linear and set the **status** field per the recommendation (not in the description)
6. Re-validate after paste:

```bash
npm run harness:validate-issue -- --issue TEAM-XX --intended-phase planning
# or
npm run harness:validate-issue -- --issue TEAM-XX --intended-phase implementation
```

## Deferred: Custom GPT package

A Custom GPT setup package exists at [`gpt/issue-intake/`](../gpt/issue-intake/) for future productization (OAuth, uploaded knowledge, dedicated GPT). **It is not the current operating path.** See [`gpt/issue-intake/setup-guide.md`](../gpt/issue-intake/setup-guide.md).

## Plan-first vs build-direct

| Route | Linear status | When |
|-------|---------------|------|
| Plan first | Ready for Planning | Broad, ambiguous, cross-cutting, high-risk, or >7 AC / task >240 chars |
| Build direct | Ready for Build | Narrow, low-risk, ≤7 AC, task ≤240 chars |
| Not ready | Backlog | Open questions remain |

**Routing is the Linear status field.** Labels (`requires-plan`, `skip-plan`) are operational hints only — the runner does not read them today.

## Narrow-issue thresholds

Direct implementation without a prior planning comment requires:

- Task ≤ 240 characters
- Acceptance criteria ≤ 7 hyphen bullets

Constants: [`src/validate/constants.ts`](../src/validate/constants.ts)

Full contract: [`prompts/issue-intake-chatgpt.md`](../prompts/issue-intake-chatgpt.md) (canonical) or [`gpt/issue-intake/knowledge.md`](../gpt/issue-intake/knowledge.md) (deferred GPT reference)

## File vs Linear validation

| Mode | Planning marker check |
|------|----------------------|
| `--file` | No — only narrow heuristic for build-direct |
| `--issue` | Yes — durable planning comment can satisfy build-direct for broad issues |

After a planning run completes, re-validate broad issues with `--issue` and `--intended-phase implementation`.

## Parser contract

Authoritative parser: [`src/linear/parser.ts`](../src/linear/parser.ts)

Template: [`templates/linear-issue.md`](../templates/linear-issue.md)

Required sections:

- `## Target repo` (or project/team mapping in `harness.config.json`)
- `## Task`
- `## Acceptance criteria` (≥1 `-` bullet)
- `## Out of scope` (≥1 `-` bullet)

## Skill installation

The skill lives at [`skills/issue-intake/`](../skills/issue-intake/). To use it as a Cursor project skill, symlink or copy to `.cursor/skills/issue-intake/` in this repo or your user skills directory.

## Related

- Canonical ChatGPT prompt: [`prompts/issue-intake-chatgpt.md`](../prompts/issue-intake-chatgpt.md)
- Deferred Custom GPT package: [`gpt/issue-intake/`](../gpt/issue-intake/)
- Milestone doc: [`docs/milestones/m7-issue-intake.md`](milestones/m7-issue-intake.md)
- State machine: [`docs/architecture/linear-automation-state-machine.md`](architecture/linear-automation-state-machine.md)
