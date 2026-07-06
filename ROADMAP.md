# Roadmap

Phased delivery for the agentic product development harness. Each phase adds capability only after the previous loop is proven manually.

**Current phase: Cursor Automations trigger spike**

---

## Cursor Automations trigger spike (current)

**Goal:** Document and validate a status-triggered router automation on Linear issues before any full build loop.

**Already done:**
- Manual v0.1 loop proven on portfolio (see [`examples/runs/001-portfolio-github-link/`](examples/runs/001-portfolio-github-link/))
- Linear statuses and labels updated manually to match [`docs/architecture/linear-automation-state-machine.md`](docs/architecture/linear-automation-state-machine.md)
- Native Cursor ↔ Linear integration smoke-tested once — see [`docs/research/002-linear-cursor-integration-smoke-test.md`](docs/research/002-linear-cursor-integration-smoke-test.md)
- ADR accepted: [`docs/decisions/0003-automation-state-machine-and-auto-model-policy.md`](docs/decisions/0003-automation-state-machine-and-auto-model-policy.md)

**This phase includes:**
- Status-triggered **router** Cursor Automation (one automation, not many)
- Router inspects issue status/labels and exits without action on unsupported states
- First automation scope: **planning-only or docs-only**
- All agents/automations use Cursor model setting **`Auto` only**

**Not included yet:**
- Full autonomous build loop (Backlog → PR → merge without human gates)
- Multiple independent automations per status
- Named model configuration per role
- Skills or reusable automation templates beyond the spike
- Merge/deployment reporter automation

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
