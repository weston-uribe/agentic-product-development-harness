# Linear automation state machine

**Status:** Planned — statuses and labels configured manually in Linear; Cursor Automations not implemented yet.

This document defines the intended Linear issue lifecycle for the agentic product development harness. It is the contract for the first Cursor Automations trigger spike.

**Related:** [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/decisions/0003-automation-state-machine-and-auto-model-policy.md`](../decisions/0003-automation-state-machine-and-auto-model-policy.md), [`docs/research/002-linear-cursor-integration-smoke-test.md`](../research/002-linear-cursor-integration-smoke-test.md)

---

## Default active workflow

The default path includes optional planning. `Plan Review` is **not** part of this flow.

```text
Backlog
  → Ready for Planning
  → Planning
  → Ready for Build
  → Building
  → PR Open
  → PM Review
  → Engineering Review
  → Merged / Deployed
```

### Revision loop

When PM review requests changes:

```text
PM Review
  → Needs Revision
  → Revising
  → PM Review
```

### Planning bypass path

For low-risk, narrow, well-scoped issues that skip planning:

```text
Backlog
  → Ready for Build
  → Building
  → PR Open
  → PM Review
  → Engineering Review
  → Merged / Deployed
```

Issues on the bypass path join the default flow at **Building** and follow the same review and merge stages.

---

## Terminal and exception statuses

| Status | Meaning |
|--------|---------|
| **Blocked** | Work cannot proceed; requires human intervention |
| **Canceled** | Issue abandoned; no further automation |
| **Duplicate** | Superseded by another issue; no further automation |

Automations must **exit without action** when an issue is in one of these statuses unless explicitly designed for cleanup (not planned in the first spike).

---

## Deprecated: Plan Review

`Plan Review` is **not** part of the default or current automation path.

- If the status still exists in Linear, treat it as **deprecated / reserved**, not active.
- Do not route automations to `Plan Review`.
- Plan review may be reintroduced later for high-risk work; that is out of scope for the current spike.

---

## Planning policy

Planning is **optional**, not mandatory for every issue.

| Label | Behavior |
|-------|----------|
| `requires-plan` | Issue must go through **Ready for Planning** → **Planning** before **Ready for Build** |
| `skip-plan` | Issue may go directly from **Backlog** to **Ready for Build** |

### When to require planning

Require planning (via `requires-plan` or human triage) when the issue is:

- Broad or ambiguous in scope
- High-risk (security, data, auth, payments, infra)
- Multi-file or cross-cutting
- Unclear on acceptance criteria or rollback

### When to bypass planning

Bypass planning (via `skip-plan` or direct **Ready for Build**) when the issue is:

- Small and low-risk
- Narrow and well-scoped
- Has clear acceptance criteria in the Linear issue body

For bypass issues, the **Implementation Agent** may build directly from the Linear issue without a separate plan artifact. The issue description and acceptance criteria are the durable input.

### Planning agent output

When planning runs:

1. The **Planning Agent** reads the Linear issue and repo context.
2. It posts a **durable plan comment** in Linear (structured per [`templates/implementation-plan.md`](../../templates/implementation-plan.md)).
3. It moves the issue to **Ready for Build** only after the plan comment exists.

Automations must **not** advance status to **Ready for Build** without a durable plan comment when `requires-plan` is set.

---

## Cursor model policy

Every Cursor agent, cloud agent, or automation in this harness must use the Cursor model setting **`Auto`**.

| Rule | Detail |
|------|--------|
| Allowed setting | **`Auto` only** — current default and only permitted setting |
| Disallowed | Named models (Composer, GPT-5.5, Claude, or any other explicit model selection) |
| Future flexibility | Harness docs and prompts should be written so the model setting can change later without rewriting workflows |
| Blocker | If an automation cannot be configured with `Auto`, do not create it yet |
| Reporting | Agent and automation reports should mention the model setting used when relevant |

---

## Router automation design

The **first** Cursor Automation should be a **router**, not many independent automations.

### Why a router

- Linear status-change triggers may fire broadly (any status transition).
- The automation must inspect issue status and labels **first**.
- If the issue is not in a supported trigger state, it must **exit without action** — no branch, no PR, no Linear writes.

### Router behavior

| Issue status | Action |
|--------------|--------|
| **Ready for Planning** | Run planning flow (Planning Agent) |
| **Ready for Build** | Run implementation flow (Implementation Agent) |
| **Needs Revision** | Run revision flow (Revision Agent) |
| Any other status | Exit with no changes |

The router may delegate logically to role-specific prompts. The first spike may implement this as **one Cursor Automation prompt** that routes based on Linear status.

### Spike scope

The first automation should be **planning-only or docs-only**. No full autonomous build loop yet.

---

## Agent roles

Each role is **planned** — not implemented until the Cursor Automations trigger spike lands.

### Router Agent

| Field | Detail |
|-------|--------|
| **Trigger / status** | Linear status change (any); acts only on supported statuses above |
| **Input** | Linear issue (status, labels, title, description, comments) |
| **Output** | Delegation to Planning, Implementation, or Revision flow; or clean exit |
| **Linear writes** | None directly — may update status only when sub-flow completes (via delegated agent) |
| **GitHub writes** | None |
| **Must not do** | Run build or planning on unsupported statuses; configure named models; merge PRs |

### Planning Agent

| Field | Detail |
|-------|--------|
| **Trigger / status** | **Ready for Planning** (via router) |
| **Input** | Linear issue, target repo context, existing comments |
| **Output** | Durable plan comment in Linear |
| **Linear writes** | Plan comment; move to **Ready for Build** after plan exists; move to **Planning** while working if status model requires it |
| **GitHub writes** | None |
| **Must not do** | Implement code; open PRs; skip plan comment; use named models |

### Implementation Agent

| Field | Detail |
|-------|--------|
| **Trigger / status** | **Ready for Build** (via router) |
| **Input** | Linear issue, plan comment (if `requires-plan`), repo context |
| **Output** | Feature branch, commits, PR; readiness summary in Linear comment |
| **Linear writes** | Progress comments; move to **Building** while working; move to **PR Open** when PR exists |
| **GitHub writes** | Branch, commits, PR (link back to Linear issue) |
| **Must not do** | Merge PRs; deploy without human gate; advance past **PR Open** without a PR; use named models |

### Revision Agent

| Field | Detail |
|-------|--------|
| **Trigger / status** | **Needs Revision** (via router) |
| **Input** | Linear issue, PM review feedback comments, existing PR and branch |
| **Output** | Additional commits on branch; revision summary comment |
| **Linear writes** | Revision summary comment; move to **Revising** while working; move back to **PM Review** when ready |
| **GitHub writes** | Commits on existing PR branch |
| **Must not do** | Merge PRs; ignore PM feedback; use named models |

### Merge / Deployment Reporter

| Field | Detail |
|-------|--------|
| **Trigger / status** | **Merged / Deployed** (manual or post-merge hook — not in first spike) |
| **Input** | Merged PR, deployment URL (e.g. Vercel preview/production) |
| **Output** | Final status comment with links and evidence |
| **Linear writes** | Closure comment with PR merge link and preview/production URL |
| **GitHub writes** | None (read-only) |
| **Must not do** | Trigger merges; use named models |

---

## Durable context principle

Automations and agents must treat **durable artifacts** as the source of truth.

| Principle | Detail |
|-----------|--------|
| **Durable state required** | Linear comments, GitHub PR/commits/branch, Vercel preview URLs, and issue fields must hold enough context to resume work |
| **Session reuse is optional** | Reusing an existing agent session is a happy-path optimization when Cursor supports it and it saves tokens |
| **Fresh agent recovery** | A new agent must always be able to reconstruct context from Linear, GitHub, branch, PR, commits, Vercel preview, and Linear comments |
| **No hidden memory** | Hidden agent or session memory must **never** be the source of truth |

Before advancing Linear status, the agent must ensure the required durable artifact exists (plan comment, PR link, revision summary, etc.).

---

## Honest maturity

| Item | Status |
|------|--------|
| Linear statuses and labels | **Configured manually** in Linear |
| Native Cursor ↔ Linear trigger | **Smoke-tested once** — see research note 002 |
| Cursor Automations router | **Planned** — not implemented |
| Full autonomous build loop | **Not planned** for first spike |
| Named model configuration | **Disallowed** — `Auto` only |
