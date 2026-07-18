# Milestone 1 Rapid dogfood status

Date: 2026-07-17

## Automated Rapid gate (completed)

| Check | Result |
|---|---|
| `npm run build` | Pass |
| `npx vitest run tests/evaluation` (27 tests) | Pass |
| `tests/runner/implementation.test.ts` | Pass |
| `tests/runner/handoff.test.ts` | Pass |
| `tests/runner/orchestrator.test.ts` | Pass |

## Prepared Linear issue

- [FRE-2](https://linear.app/weston-product-lab/issue/FRE-2/langfuse-m1-dogfood-add-readme-note-line-for-target-app) — Backlog, narrow README-only dogfood task

## Live dogfood (blocked — requires human)

Blocked at Langfuse Cloud sign-in. Browser reached GitHub OAuth for Langfuse US (`https://us.cloud.langfuse.com`) and requires interactive login.

### Remaining human steps

1. Sign in / create Langfuse US account (browser tab may already be on GitHub OAuth).
2. Create project `p-dev-maintainer-evals` and API keys.
3. Set GitHub Actions secrets on this harness repo:
   - `LANGFUSE_PUBLIC_KEY`
   - `LANGFUSE_SECRET_KEY`
4. Set GitHub Actions variables:
   - `P_DEV_EVALUATION_PROVIDER=langfuse`
   - `P_DEV_EVALUATION_CAPTURE_PROFILE=metadata-v1`
   - `P_DEV_EVALUATION_NAMESPACE=weston-dogfood`
   - `LANGFUSE_BASE_URL=https://us.cloud.langfuse.com`
   - `LANGFUSE_TRACING_ENVIRONMENT=dogfood`
5. Merge/push the Milestone 1 implementation to the branch GHA checks out (default `main`).
6. Move **FRE-2** to **Ready for Build**, wait for implementation → handoff → **PM Review**.
7. In Langfuse, confirm one session with implementation + handoff traces, expected children, correlation IDs matching `runs/<issue>/**/manifest.json` / `harness-run-output.json`, and no forbidden content.

### Suggested commands after keys exist

```bash
gh secret set LANGFUSE_PUBLIC_KEY
gh secret set LANGFUSE_SECRET_KEY
gh api --method POST repos/weston-uribe/agentic-product-development-harness/actions/variables \
  -f name=P_DEV_EVALUATION_PROVIDER -f value=langfuse
# …repeat for other variables
```
