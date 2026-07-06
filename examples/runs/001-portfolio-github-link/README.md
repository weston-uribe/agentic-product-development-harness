# Run 001: Portfolio GitHub link

First manual v0.1 harness run against [`weston-uribe-portfolio`](https://github.com/weston-uribe/weston-uribe-portfolio).

## Current status

| Item | State |
|------|-------|
| Implementation | Complete — commit `1a4a4e3` on `feat/portfolio-github-link` |
| PR | **Open** — [#1](https://github.com/weston-uribe/weston-uribe-portfolio/pull/1) |
| Validation | Lint, build, manual inspection, and Vercel preview — **passed** |
| Merge | **Awaiting** PM/product review and engineering/code review |

Vercel preview: https://weston-uribe-portfolio-git-feat-portfo-f948b1-kinterra-team-url.vercel.app

## Why this was chosen as the first v0.1 harness test

- **Small, bounded scope** — one product surface (contact or footer), one outbound link, easy to eval.
- **Real portfolio value** — hiring managers reviewing the live site can reach the public repo without hunting on GitHub.
- **Exercises the full loop** — issue → plan → repo inspection → implementation → eval → PR readiness, without touching backend, auth, or case-study content.
- **Forces repo discovery** — the implementation agent must inspect the portfolio codebase before choosing placement (contact vs footer) and matching existing link patterns.

## What success means

1. A GitHub link to `https://github.com/weston-uribe/weston-uribe-portfolio` appears in the appropriate contact/footer area.
2. The link is visually consistent, accessible, and does not break existing contact, resume, or LinkedIn behavior.
3. Lint/build pass; scope stays narrow (no unrelated refactors).
4. All four run artifacts are filled: issue (done), plan (preliminary), scorecard and PR readiness report (after implementation).
5. A short retrospective is added to [`docs/research/`](../../docs/research/) capturing template friction and what to encode later—**not** skills yet.

## What should be learned before creating reusable skills

- Where contact/social links live in the portfolio repo and how they are structured.
- Whether “inspect repo first” belongs in every implementation plan template.
- Which eval criteria repeat across UI link changes vs one-offs.
- How long the manual loop takes and where PM vs agent time is spent.
- Whether placement decisions (contact vs footer) should be decided in the issue or left to the implementation agent after inspection.

## Artifacts in this folder

| File | Status |
|------|--------|
| [`linear-issue.md`](linear-issue.md) | Defined |
| [`implementation-plan.md`](implementation-plan.md) | Execution complete — contact section placement confirmed in PR |
| [`eval-scorecard.md`](eval-scorecard.md) | Scored — all Pass; PM sign-off pending |
| [`pr-readiness-report.md`](pr-readiness-report.md) | Complete — ready for review, not merged |

## Next step

1. PM/product review on [Vercel preview](https://weston-uribe-portfolio-git-feat-portfo-f948b1-kinterra-team-url.vercel.app) and [PR #1](https://github.com/weston-uribe/weston-uribe-portfolio/pull/1).
2. Engineering/code review on the three-file diff.
3. Merge decision after both gates pass.
4. Add retrospective to `docs/research/` after merge (or after review feedback).
