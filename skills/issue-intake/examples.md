# Issue intake examples

## Build-direct (Ready for Build)

**Title:** Add portfolio hello world page

**Recommended status:** Ready for Build

**Recommended labels (operational, optional):** `harness`, `portfolio`, `skip-plan`

**Target repo:** weston-uribe/weston-uribe-portfolio

### Reasoning

Narrow scope: one page, one nav link, three acceptance criteria. Task under 240 characters. Low risk.

### Linear description

```markdown
## Target repo

weston-uribe/weston-uribe-portfolio

## Task

Add a temporary Hello World page and a top-nav link to it.

## Acceptance criteria

- [ ] A `/hello` route renders "Hello World"
- [ ] Top navigation includes a link to the new page
- [ ] Change is limited to portfolio repo scope

## Out of scope

- Styling beyond minimal placeholder
- Permanent production content
- Harness repo changes

## Validation expectations

- `npm run lint`
- `npm run build`
```

**Validate:** `npm run harness:validate-issue -- --file draft.md --intended-phase implementation`

---

## Plan-first (Ready for Planning)

**Title:** Redesign portfolio navigation and information architecture

**Recommended status:** Ready for Planning

**Recommended labels (operational, optional):** `harness`, `portfolio`, `requires-plan`

**Target repo:** weston-uribe/weston-uribe-portfolio

### Reasoning

Cross-cutting UI change with ambiguous scope, multiple pages affected, and more than seven likely acceptance criteria. Requires a planning comment before implementation.

### Linear description

```markdown
## Target repo

weston-uribe/weston-uribe-portfolio

## Task

Redesign the portfolio site navigation and information architecture so visitors can find case studies, about, and contact flows without confusion.

## Acceptance criteria

- [ ] Primary nav reflects the new IA
- [ ] Mobile nav matches desktop destinations
- [ ] Case study index is reachable in one click from home
- [ ] About page is reachable in one click from home
- [ ] Contact flow is reachable in one click from home
- [ ] No broken internal links after restructure
- [ ] Preview looks correct on mobile and desktop
- [ ] Lint and build pass

## Out of scope

- New CMS integration
- Auth or payments
- Harness repo changes

## Validation expectations

- `npm run lint`
- `npm run build`
- Manual preview review on Vercel
```

**Validate:** `npm run harness:validate-issue -- --file draft.md --intended-phase planning` (passes) and `--intended-phase implementation` (fails — too broad for build-direct)
