# Roadmap

Phased delivery for the agentic product development harness. Each phase adds capability only after the previous loop is proven manually.

**Current phase: Merge automation spike (Milestone 6)**

---

## Merge automation spike (current)

**Goal:** Close the solo-PM merge loop — **Ready to Merge → Merging → Merged / Deployed** — by squash-merging the accepted PR and posting a completion comment.

**Already done:**
- M1–M5 SDK runners validated (planning, implementation, handoff, revision)
- See [`docs/milestones/m6-merge-phase.md`](docs/milestones/m6-merge-phase.md) for M6 scope

**This phase includes:**
- SDK merge runner from **Ready to Merge**
- GitHub squash merge via REST API
- Checks policy before merge
- Best-effort production deployment capture
- Linear transition to **Merged / Deployed** after completion comment

**Not included yet:**
- Engineering Review transition
- Release tags
- Skills or watcher/poller

---

## Revision automation spike (completed)

**Goal:** Close the PM feedback loop — **Needs Revision → Revising → PM Review** — by updating the existing PR branch via Cursor cloud agent.

**Already done:**
- M1–M4 SDK runners validated (planning, implementation, handoff)
- See [`docs/milestones/m5-revision-phase.md`](docs/milestones/m5-revision-phase.md) for M5 scope

**Delivered:**
- SDK revision runner from **Needs Revision**
- PM feedback detection from Linear comments after handoff marker
- Cursor cloud agent on existing branch/PR (`autoCreatePR: false`)
- Linear transition back to **PM Review** after revision comment

**Not included (deferred to M6+):**
- Engineering Review transition
- Merge/deploy automation (delivered in M6)
- Skills or watcher/poller

---

## Handoff automation spike (completed)

**Goal:** After implementation opens a PR, inspect GitHub, capture Vercel preview when available, post PM handoff comment, and transition **PR Open → PM Review** — without a revision loop.

**Already done (planning-router spike — validated):**
- Manual v0.1 loop proven on portfolio (see [`examples/runs/001-portfolio-github-link/`](examples/runs/001-portfolio-github-link/))
- Linear statuses and labels updated manually to match [`docs/architecture/linear-automation-state-machine.md`](docs/architecture/linear-automation-state-machine.md)
- Native Cursor ↔ Linear integration smoke-tested once — see [`docs/research/002-linear-cursor-integration-smoke-test.md`](docs/research/002-linear-cursor-integration-smoke-test.md)
- ADR accepted: [`docs/decisions/0003-automation-state-machine-and-auto-model-policy.md`](docs/decisions/0003-automation-state-machine-and-auto-model-policy.md)
- **Planning-router Cursor Automation validated** — see [`docs/research/003-cursor-automation-planning-router-spike.md`](docs/research/003-cursor-automation-planning-router-spike.md) (WES-9, WES-10)
  - Linear status-change trigger
  - Linear MCP auth inside automation environment
  - Issue read/write and status path: Ready for Planning → Planning → Ready for Build
  - Durable planning comment
  - Silent no-op for duplicate/non-matching runs
- **SDK planning runner validated** — Milestone 2 implements Linear Ready for Planning → Planning → Cursor cloud planning agent → Ready for Build. See [`docs/milestones/m2-planning-phase.md`](docs/milestones/m2-planning-phase.md).
- **SDK implementation runner implemented** — Milestone 3 adds Ready for Build → Building → Cursor cloud implementation agent → PR Open. See [`docs/milestones/m3-implementation-phase.md`](docs/milestones/m3-implementation-phase.md).
- **SDK handoff runner implemented** — Milestone 4 adds PR Open → GitHub PR inspect + Vercel preview capture → PM Review. See [`docs/milestones/m4-handoff-phase.md`](docs/milestones/m4-handoff-phase.md).
- **SDK revision runner implemented** — Milestone 5 adds Needs Revision → Revising → PM Review on existing PR branch. See [`docs/milestones/m5-revision-phase.md`](docs/milestones/m5-revision-phase.md).
- **SDK merge runner implemented** — Milestone 6 adds Ready to Merge → Merging → Merged / Deployed with squash merge and deployment capture. See [`docs/milestones/m6-merge-phase.md`](docs/milestones/m6-merge-phase.md).

**Delivered:**
- SDK handoff runner starting from **PR Open**
- GitHub PR inspection via REST API (`GITHUB_TOKEN` required)
- Vercel preview capture from PR comments (bounded polling)
- Linear status transition to **PM Review** after handoff comment
- Auto routing: **PR Open → handoff** (not implementation)

See [`docs/milestones/m4-handoff-phase.md`](docs/milestones/m4-handoff-phase.md).

**Not included (deferred to M5+):**
- Revision loop (delivered in M5)
- Merge/deployment reporter automation
- Skills or reusable automation templates beyond validated spikes

---

## Implementation automation spike (completed)

**Goal:** Validate a docs-only implementation flow triggered from **Ready for Build** — branch creation, PR opening, and Linear status transition — without a revision loop.

**Delivered:**
- SDK implementation runner starting from **Ready for Build**
- Branch creation and PR opening through Cursor cloud agent
- Linear status transition to **PR Open** after PR exists
- Router inspects issue status and exits on unsupported states
- Configured model: **Composer 2.5**

See [`docs/milestones/m3-implementation-phase.md`](docs/milestones/m3-implementation-phase.md).

**Not included (deferred to M4+):**
- PM Review transition from the SDK runner (delivered in M4 handoff)
- Revision loop (delivered in M5)
- Merge/deployment reporter automation
- Skills or reusable automation templates beyond validated spikes

---

## Cursor Automations trigger spike (completed)

**Goal:** Document and validate a status-triggered router automation on Linear issues before any full build loop.

**Status:** **Validated** — planning-router spike complete (WES-9, WES-10). See [`docs/research/003-cursor-automation-planning-router-spike.md`](docs/research/003-cursor-automation-planning-router-spike.md).

**Delivered:**
- Status-triggered **router** Cursor Automation (one automation, not many)
- Router inspects issue status/labels and exits silently on unsupported states
- Planning flow: durable plan comment, status path to **Ready for Build**
- Idempotent silent no-op for duplicate self-triggered runs

---

## v0.1 — Manual Cursor loop

**Goal:** Prove one end-to-end product issue → Cursor implementation → human review loop using docs and templates only.

**Status:** Completed for first portfolio run; artifacts in [`examples/runs/001-portfolio-github-link/`](examples/runs/001-portfolio-github-link/).

**Deliverables:**
- README, ROADMAP, ARCHITECTURE, AGENTS
- ADR: Cursor-first v0.1
- Templates: linear-issue, implementation-plan, pr-readiness-report, eval-scorecard
- Placeholder READMEs for evals, skills, examples
- First manual run documented against `weston-uribe-portfolio`

**Not included yet:**
- Automated eval runners
- Production Linear automation
- GitHub Actions or PR bots
- Cloud agents (beyond one smoke test)
- Cursor skills
- UI or control plane

---

## v0.2 — Eval / readiness contract

**Goal:** Formalize what “ready for review” means with repeatable, human-readable rubrics that can later become automated checks.

**Deliverables:**
- Standard eval criteria per work type (UI change, content, API, etc.)
- Readiness gate checklist tied to templates
- Example scorecards from real portfolio runs
- Documented pass/partial/fail semantics

**Not included yet:**
- Automated test execution
- CI integration for evals
- Linear sync

---

## v0.3 — Linear control plane

**Goal:** Use Linear as the PM source of truth for intake, status, and traceability—with optional planning and router-based automations.

**Deliverables:**
- Issue template aligned with Linear fields and labels (`requires-plan`, `skip-plan`)
- Documented issue → plan comment → PR linking convention
- Router automation operational for planning and build triggers
- Durable context verified: fresh agent can resume from Linear + GitHub alone

**Not included yet:**
- Full bidirectional Linear sync
- Automated issue creation from harness
- SLA or assignment automation

---

## v0.4 — PR + preview workflow

**Goal:** Connect implementation output to GitHub PRs and Vercel preview URLs for product review.

**Deliverables:**
- PR readiness report tied to preview URL
- Review checklist for hiring-manager / PM audience
- Documented branch and PR naming conventions
- Revision loop automation (Needs Revision → Revising → PM Review)

**Not included yet:**
- Auto-merge
- Preview comment bots
- Unattended deployment

---

## v0.5 — Cloud agent experiments

**Goal:** Explore cloud-hosted agents for bounded, async tasks while keeping human gates.

**Deliverables:**
- Documented experiments (what worked, what failed)
- Scope boundaries for cloud vs local Cursor
- Safety and review requirements for cloud runs

**Not included yet:**
- Production cloud agent pipeline
- Unattended merges
- Cost/ops runbooks at scale

---

## v1.0 — Reusable agentic product sprint harness

**Goal:** A portable harness other PMs or teams can adopt for structured AI-assisted product sprints.

**Deliverables:**
- Validated manual + semi-automated loop
- Skills for repeated workflows (only after manual validation)
- Examples across at least one non-portfolio repo
- Onboarding doc for new target repos

**Not included yet (explicit non-goals for v1.0):**
- Fully autonomous software delivery
- Replacement for `AGENTS.md` or repo-specific agent guides
- Vendor lock-in to a single AI provider
