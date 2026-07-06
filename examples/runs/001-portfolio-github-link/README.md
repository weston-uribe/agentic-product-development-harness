# Run 001: Portfolio GitHub link

First manual v0.1 harness run against [`weston-uribe-portfolio`](https://github.com/weston-uribe/weston-uribe-portfolio).

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
| [`implementation-plan.md`](implementation-plan.md) | Preliminary — requires repo inspection before execution |
| [`eval-scorecard.md`](eval-scorecard.md) | Criteria defined; scores pending implementation |
| [`pr-readiness-report.md`](pr-readiness-report.md) | Placeholder — fill after implementation |

## Next step

Open `/Users/weston/Code/weston-uribe-portfolio` in Cursor, approve the implementation plan after repo inspection, execute the change, then complete the scorecard and PR readiness report in this folder.
