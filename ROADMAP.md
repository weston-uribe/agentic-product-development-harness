# Roadmap

Phased delivery for the agentic product development harness. Each phase adds capability only after the previous loop is proven manually.

**Current phase: v0.1**

---

## v0.1 — Manual Cursor loop

**Goal:** Prove one end-to-end product issue → Cursor implementation → human review loop using docs and templates only.

**Deliverables:**
- README, ROADMAP, ARCHITECTURE, AGENTS
- ADR: Cursor-first v0.1
- Templates: linear-issue, implementation-plan, pr-readiness-report, eval-scorecard
- Placeholder READMEs for evals, skills, examples
- First manual run documented against `weston-uribe-portfolio`

**Not included yet:**
- Automated eval runners
- Linear API integration
- GitHub Actions or PR bots
- Cloud agents
- Cursor skills or automations
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

**Goal:** Use Linear (or Linear-style issues) as the PM source of truth for intake, status, and traceability.

**Deliverables:**
- Issue template aligned with Linear fields
- Documented issue → plan → PR linking convention
- Optional: export/import scripts or MCP-assisted issue bootstrap

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

**Not included yet:**
- Auto-open PRs from agent runs
- Preview comment bots
- Merge automation

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
