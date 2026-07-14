# Skill architecture

**Status:** Implemented — architecture artifact and canonical path. Operator-invoked skills: `issue-intake`, `code-health-audit`, `architecture-evolution-audit`, and `security-audit` are implemented. Runner/agent phase skills: `planner` and `implementation` are implemented.

This document defines the harness skill system. It does **not** create the full skill set.

## What a harness skill is

A harness skill is a **reusable workflow contract** for an agent or operator.

| Concept | What it is |
|---------|------------|
| **Skill** | Version-controlled workflow contract with clear inputs, outputs, boundaries, and maturity labels |
| **Prompt** | Instructions for a single run or client session — not necessarily a durable, reviewable contract |
| **Tool** | Executable capability (CLI, MCP, API) — not a workflow definition |

A skill is **not** merely a prompt and **not** a tool.

## Canonical layout

Canonical harness skills live at:

```text
.agents/skills/<skill-name>/SKILL.md
```

Rules:

- Every canonical skill has **exactly one** primary `SKILL.md`.
- Additional files exist only when they materially improve clarity, reuse, validation, or execution.
- Tool-specific locations (`.cursor/skills`, `.claude/skills`, ChatGPT project files, future Codex adapters) are **adapters** — generated copies, symlinks, exports, or client-specific forms. They are **not** the canonical source of truth.

Documentation about the skill system lives under [`docs/skills/`](README.md).

## Skill folder shape

Minimum:

```text
.agents/skills/<skill-name>/
  SKILL.md
```

Optional supporting files, only when needed:

- `examples.md` or `examples/`
- `references/` — shared reference material consumed by the skill
- `modes/` — mode-specific instructions when one skill has distinct execution modes
- `resources/` — static assets or templates
- `scripts/` — helper scripts used by the skill workflow
- `adapters/` — client-specific export notes or adapter stubs

Do not add structure before a second or third skill proves it is needed. Prefer a flat folder with one or two markdown files until complexity warrants more.

## Adapter model

Client and provider locations are **adapters**, not canonical sources:

| Location | Role |
|----------|------|
| `.agents/skills/<skill-name>/` | **Canonical** repo source |
| `.cursor/skills/<skill-name>/` | Cursor install/adaptation location |
| `.claude/skills/<skill-name>/` | Future Claude adapter (not implemented) |
| ChatGPT project files | Future export/adaptation (not implemented) |
| Future Codex adapters | Future export/adaptation (not implemented) |

**Do not claim** Claude, Codex, ChatGPT adapter automation, or multi-client skill sync as implemented until an adapter is proven end to end.

## Ownership and promotion

Skill creation and promotion are **human-owned** product/architecture decisions. Agents may propose, draft, or document skill candidates, but must not autonomously create, promote, or enforce skill-creation policy. Repetition or validation history may be useful evidence, but it is not a required gate unless explicitly set by the human operator.

## Skill categories

### Operator-invoked skills

Used directly by the operator in an agent client (Cursor, future clients). The operator chooses when to invoke the skill.

**Implemented:**

| Skill | Purpose |
|-------|---------|
| `issue-intake` | Turn a fuzzy product idea into a harness-compatible Linear issue |
| `code-health-audit` | Report-only inspection of code health |
| `architecture-evolution-audit` | Report-only inspection of architecture evolution and future-change readiness |
| `security-audit` | Report-only security risk inspection |

**Planned architecture concepts only** (not implemented):

| Skill | Purpose |
|-------|---------|
| `performance-cost-audit` | Report-only performance and cost inspection |

### Runner / agent phase skills

Reusable workflow contracts aligned with harness phases and cloud agent runs. They describe what an agent should do when planning or implementing work; they are distinct from operator-invoked skills.

Runner/agent phase skills are **workflow contracts only** today. They are **not** wired as runner prompt integration — SDK runners continue to use [`src/prompts/*.md`](../src/prompts/). Status routing and Linear transitions remain runner-owned.

**Implemented:**

| Skill | Trigger context | Purpose |
|-------|-----------------|---------|
| `planner` | Ready for Planning | Produce durable planning output and reviewable PR slices for operator or runner use |
| `implementation` | Ready for Build, Needs Revision, integration repair | Scoped code changes on a feature branch |

#### Planner modes (implemented)

- Feature planning
- Audit-remediation planning (convert audit findings into remediation plans)

#### Shared planner capability (implemented)

- PR slicing — applied inside feature planning or audit-remediation planning when work is too large for one reviewable PR; not a standalone mode

#### Implementation modes (implemented)

- Initial build
- Revision (same agent, same branch — preserves context continuity)
- Integration repair (same agent — preserves branch/context continuity)

Revision and integration repair are **modes of the same implementation agent**, not separate agents.

## Audit skill policy

Audit skills are **report-only**. They inspect and produce findings. They do not make code changes.

| Role | Responsibility |
|------|----------------|
| Audit skills | Inspect and report findings |
| Planner | Convert findings into remediation plans and reviewable PR slices |
| Implementation agent | Make scoped code changes |

Implemented audit skills are `code-health-audit`, `architecture-evolution-audit`, and `security-audit`. Additional audit skills remain planned.

## What is not a skill (for now)

These remain templates, runner behavior, or references — not formal top-level skills:

- UI/design standards (planned future implementation **reference**, not a standalone skill)
- Reporting contracts and handoff reports
- PR-readiness review
- Umbrella release-readiness audit

A dedicated **release** skill is **not implemented**. Use conditional release-impact analysis in the canonical `planner` skill and aligned runtime planning prompt until a future human-owned decision explicitly promotes release orchestration into its own skill.

## Shared references and embedded standards

Some cross-cutting concerns are embedded in skill boundaries rather than promoted to standalone skills:

| Concern | Status |
|---------|--------|
| **PR slicing** | Implemented as a shared planner capability — not a standalone skill |
| **Scope control** | Embedded in planner and implementation skill boundaries |
| **Validation expectations** | Embedded by role — audit and planner skills are read-only; implementation performs validation and reports results |
| **UI/design standards** | Planned future implementation reference — not a standalone skill and not implemented in this PR |

## Relationship to runner prompts

SDK runner prompts in [`src/prompts/`](../src/prompts/) are **implementation details** for cloud agent phases today. They are not canonical harness skills.

| Layer | Location | Status |
|-------|----------|--------|
| Canonical skills | `.agents/skills/<skill-name>/SKILL.md` | `issue-intake`, `code-health-audit`, `architecture-evolution-audit`, `security-audit`, `planner`, `implementation` implemented |
| Runner prompts | `src/prompts/*.md` | Implemented for SDK phases |
| Client adapters | `.cursor/skills`, etc. | Manual install/export only |

Runner prompt contracts may be absorbed or referenced by canonical skills over time, but that migration is not part of this architecture artifact.

## Current implemented state

After this document and the accompanying migration:

| Item | Status |
|------|--------|
| `issue-intake` | **Implemented** at [`.agents/skills/issue-intake/SKILL.md`](../../.agents/skills/issue-intake/SKILL.md) |
| `code-health-audit` | **Implemented** at [`.agents/skills/code-health-audit/SKILL.md`](../../.agents/skills/code-health-audit/SKILL.md) |
| `planner` | **Implemented** at [`.agents/skills/planner/SKILL.md`](../../.agents/skills/planner/SKILL.md) |
| `implementation` | **Implemented** at [`.agents/skills/implementation/SKILL.md`](../../.agents/skills/implementation/SKILL.md) |
| `architecture-evolution-audit` | **Implemented** at [`.agents/skills/architecture-evolution-audit/SKILL.md`](../../.agents/skills/architecture-evolution-audit/SKILL.md) |
| `security-audit` | **Implemented** at [`.agents/skills/security-audit/SKILL.md`](../../.agents/skills/security-audit/SKILL.md) |
| `performance-cost-audit` | Planned architecture concept only |
| Skill registry / package manager | Not implemented — intentionally deferred |
| Skill manifests | Not implemented — intentionally deferred |
| Runner-skill / prompt integration | Not implemented — `src/prompts/*.md` remain runner implementation details |
| Provider/client adapters | Not implemented — documented as future work |

## Compatibility

Older paths under [`skills/`](../../skills/) are compatibility pointers only. See [`skills/README.md`](../../skills/README.md).

## Related docs

- Issue intake operator guide: [`docs/issue-intake.md`](../issue-intake.md)
- Provider portability: [`docs/provider-portability.md`](../provider-portability.md)
- Architecture overview: [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- Agent guide: [`AGENTS.md`](../../AGENTS.md)
