# Issue intake examples

Generic examples aligned with [`prompts/issue-intake-chatgpt.md`](../../../prompts/issue-intake-chatgpt.md). Validator fixtures in `tests/fixtures/issues/` may use operator-specific allowlist repos.

## Build-direct (Ready for Build candidate)

**Title:** Add order confirmation toast on checkout success

**Recommended status:** Backlog (until operator approves Ready for Build)

**Optional labels:** `harness`, `checkout-web`, `skip-plan`

**Target repo:** acme-corp/checkout-web

### Readiness assessment

- Valid for planning: yes — all required sections present
- Valid for direct implementation: yes — task under 240 characters, 3 acceptance criteria, low-risk UI change

### Blocking questions

- none

### Linear description

```markdown
## Target repo

acme-corp/checkout-web

## Task

Show a success toast when the customer completes checkout.

## Acceptance criteria

- [ ] A toast appears within 2 seconds of successful payment
- [ ] Toast message includes the order confirmation number
- [ ] Toast auto-dismisses after 5 seconds

## Out of scope

- Email confirmation changes
- Payment provider integration changes
- Other pages or flows

## Validation expectations

- `npm run lint`
- `npm run build`
- Manual test on staging checkout flow
```

**Validate (operator, with allowlisted repo fixture):** `npm run harness:validate-issue -- --file draft.md --intended-phase implementation`

---

## Plan-first (Ready for Planning)

**Title:** Redesign checkout navigation and information architecture

**Recommended status:** Ready for Planning

**Optional labels:** `harness`, `checkout-web`, `requires-plan`

**Target repo:** acme-corp/checkout-web

### Readiness assessment

- Valid for planning: yes — all required sections present
- Valid for direct implementation: no — 8 acceptance criteria exceeds 7; cross-cutting IA change

### Blocking questions

- none

### Linear description

```markdown
## Target repo

acme-corp/checkout-web

## Task

Redesign checkout navigation and information architecture so customers can complete purchase, review order details, and access support without confusion.

## Acceptance criteria

- [ ] Primary nav reflects the new IA across checkout steps
- [ ] Mobile nav matches desktop destinations
- [ ] Cart is reachable in one click from any checkout step
- [ ] Order summary is reachable in one click from payment step
- [ ] Support/help link is visible on every checkout step
- [ ] No broken internal links after restructure
- [ ] Preview looks correct on mobile and desktop
- [ ] Lint and build pass

## Out of scope

- Payment provider integration changes
- New CMS integration
- Backend API redesign

## Validation expectations

- `npm run lint`
- `npm run build`
- Manual preview review on staging
```

**Validate:** `npm run harness:validate-issue -- --file draft.md --intended-phase planning` (passes) and `--intended-phase implementation` (fails — too broad for build-direct)
