# Eval scorecard: Add GitHub link to portfolio contact or footer

<!-- Run 001 — scored after implementation. Based on templates/eval-scorecard.md -->

## Run metadata

| Field | Value |
|-------|-------|
| Issue | [`linear-issue.md`](linear-issue.md) |
| Target repo | `weston-uribe/weston-uribe-portfolio` |
| Target local path | `/Users/weston/Code/weston-uribe-portfolio` |
| Branch / PR | `feat/portfolio-github-link` / [PR #1](https://github.com/weston-uribe/weston-uribe-portfolio/pull/1) |
| Commit | `1a4a4e3406bc9e8e7f86c85fc2660ad71263e92a` — Add GitHub contact link |
| Agent / executor | Cursor (manual v0.1 loop) |
| Date | 2026-07-06 |

## Scoring legend

| Score | Meaning |
|-------|---------|
| **Pass** | Criterion fully met; evidence attached |
| **Partial** | Mostly met; minor gaps documented |
| **Fail** | Not met; blocks readiness |
| **N/A** | Not applicable to this work type |

## Criteria

| # | Criterion | Score | Evidence |
|---|-----------|-------|----------|
| 1 | GitHub link exists and points to `https://github.com/weston-uribe/weston-uribe-portfolio` | **Pass** | GitHub card in contact section; URL exactly `https://github.com/weston-uribe/weston-uribe-portfolio` (commit `1a4a4e3`, `lib/portfolio/content.ts`) |
| 2 | Link is visually consistent with existing contact/social links | **Pass** | GitHub card follows same card pattern as Email, LinkedIn, Resume; card order Email → LinkedIn → GitHub → Resume; 2×2 grid from `md` breakpoint. Icon deviation: inline GitHub SVG used instead of Lucide `Github` (not in `lucide-react@^1.20.0`) — matches existing `LinkedInIcon` inline SVG pattern; acceptable for visual consistency and build correctness |
| 3 | Link is accessible (keyboard focus, visible name or aria-label, sufficient contrast) | **Pass** | Manual contact-section inspection passed; card uses same interactive pattern as sibling contact cards |
| 4 | No existing contact, resume, or LinkedIn behavior breaks | **Pass** | Email, LinkedIn, and Resume behavior preserved per manual inspection and Vercel preview check |
| 5 | `npm run lint` passes | **Pass** | `npm run lint` — passed |
| 6 | `npm run build` passes | **Pass** | `npm run build` — passed |
| 7 | Scope stayed narrow — no unrelated file changes | **Pass** | Three files only: `components/custom/portfolio/contact-section.tsx`, `lib/portfolio/content.ts`, `lib/constants/breakpoints.ts` |
| 8 | Matches acceptance criteria from issue (placement, new tab, mobile check) | **Pass** | Contact section only (issue allowed contact or footer); `target="_blank"` with `rel="noopener noreferrer"`; grid/layout verified on preview |

## Known deviation (acceptable)

| Deviation | Resolution |
|-----------|------------|
| Planned Lucide `Github` icon unavailable in `lucide-react@^1.20.0` | Inline GitHub SVG added, consistent with `LinkedInIcon` pattern; lint and build pass; no visual regression observed on preview |

## Summary

- **Overall readiness:** Ready for PM/product review and engineering/code review — **not merged**
- **Blocking failures:** None

**PM/product review:** Final human approval before merge is **still pending**. This scorecard reflects automated and manual validation only.

## Human sign-off

- [ ] PM / owner reviewed scorecard
- Sign-off: _______________
- Date: _______________

## Follow-ups

Template or process improvements discovered during this eval:

- Document icon/library availability checks in implementation plan when reusing Lucide names
- Confirm whether mobile viewport was explicitly checked or inferred from responsive grid — consider explicit mobile row in validation plan for future UI runs
