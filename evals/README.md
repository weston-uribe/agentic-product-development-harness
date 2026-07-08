# Evals

Human-readable readiness rubrics and eval contracts for the agentic product development harness.

## v0.1 approach

Evals start as **manual scorecards**, not automated test suites. Use [`templates/eval-scorecard.md`](../templates/eval-scorecard.md) to record pass / partial / fail / N-A per criterion with evidence and human sign-off.

## Why manual first

Automated evals are only useful when the criteria are stable. v0.1 runs against real issues (starting with the portfolio repo) will reveal which criteria repeat and which are one-offs.

## Future direction (planned)

| Phase | Eval capability |
|-------|-----------------|
| v0.1 | Manual rubrics in markdown |
| v0.2 eval contract | **Deferred** — superseded by V0.2.0 source release scope; see [`docs/releases/v0.2.0.md`](../docs/releases/v0.2.0.md) |
| Later | Optional automated checks (lint, tests, preview smoke) tied to scorecard rows |

## What belongs here

- Standard criteria sets by work type (when validated)
- Example completed scorecards from real runs
- Notes on criteria that failed or were ambiguous

## What does not belong here yet

- CI scripts or test runners
- Auto-grading agents
- Production gate enforcement
