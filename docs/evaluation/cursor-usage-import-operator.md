# Cursor usage import (operator guide)

Bulk import of Cursor usage CSV into Langfuse as **score-only** enrichment on existing harness phase traces.

## What this does / does not do

| Does | Does not |
|------|----------|
| Attach deterministic token/cost proxy scores to agent-invoking phase traces | Mutate historical Langfuse observations or recreate traces |
| Use Cloud Agent ID → Cursor Agent ID join | Treat Admin API events as issue/phase attribution (aggregate-only under current docs) |
| Require an explicit Cursor export window for source-scope completeness | Invent export bounds from the first/last CSV row |
| Keep private Cloud Agent IDs in server-side staged artifacts only | Fix the native Langfuse generation cost dashboard |
| Revalidate the approved score plan (manifest digests) on Apply | Silently apply when discovery targets or pricing inputs changed |

Native `generationCostComplete` / `cursor_exact_cost_complete` remain false until Cursor reports truthful generation usage.

## Source scope (locked)

- Export window must **contain** the agent execution window (default safety margin `0` ms).
- Attribution may use a separate ingestion slack for candidate matching; that slack does **not** expand the export window.
- Every CSV row is in scope. There are no operator issue/phase exclusion filters in this checkpoint.
- Parser rejections without recoverable Cloud Agent identity are **upload-scoped** and block the entire upload.
- Model/variant conflicts make source scope incomplete and disable Apply.

## Discovery configuration (required)

Cursor usage discovery uses a dedicated configuration contract (not broader evaluation runtime defaults).

| Variable | Required | Meaning |
|----------|----------|---------|
| `P_DEV_EVALUATION_PROVIDER` | yes | Must be `langfuse` |
| `P_DEV_EVALUATION_NAMESPACE` | yes | Explicit nonempty namespace (no `"default"` fallback) |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | yes | API credentials (never shown in the GUI) |
| `LANGFUSE_BASE_URL` | recommended | Canonical endpoint; production requires HTTPS |
| `LANGFUSE_TRACING_ENVIRONMENT` | optional | Explicit environment filter; **unset means all environments**, not `"default"` |

Weston dogfood intended values:

- provider: `langfuse`
- namespace: `weston-dogfood`
- environment: `dogfood`

Configuration, authentication, timeout, and retrieval failures **do not create preflights**. Successful complete retrieval with zero traces, zero viable candidates, or zero agent-hash overlap may stage as incomplete diagnostic preflights with distinct source-scope reasons. A successful preflight is **not** Apply authorization.

Approval is bound to provider, namespace, nullable environment filter, full canonical endpoint identity, and a private Langfuse project-scope digest (never exposed in the GUI).

## Primary workflow (GUI)

1. Start the operator GUI (`npm start` / `p-dev`) from a workspace with the discovery variables above.
2. Open **Settings → Cursor usage**. Confirm Langfuse configured, namespace, environment filter (or All environments), and host.
3. Drag-and-drop an official Cursor usage CSV (≤ 25 MiB).
4. Enter the **export start** and **export end** from the Cursor export UI (required).
5. Run **Preflight** (disabled until configuration is ready). Review diagnostics, matched / conflict / unresolved rows, and rejection reason codes (never raw rejected cells or full agent/session IDs).
6. Apply is disabled when source scope is incomplete, upload-scoped rejections exist, or conflicts exist.
7. Confirm and **Apply**. The GUI sends the preflight approval fingerprint; Apply revalidates discovery configuration and rebuilds discovery, pricing, and the expected-score manifest and fails closed if they differ.
8. Refresh-safe: state is recovered from durable staging/ledger (`failed_recoverable` / interrupted apply may retry under recovery rules).
9. Use **Analytics** for local ledger evidence completeness and Langfuse reconciliation status (credentials alone never mark reconciliation complete). Totals cover **only ledgers in the current operator workspace**.

## CLI recovery

```bash
npm run evaluation:import-cursor-usage -- \
  --csv ./usage.csv \
  --inspect-report ./inspect.json \
  --issue FRE-6 \
  --export-start 2026-07-19T00:00:00.000Z \
  --export-end 2026-07-20T00:00:00.000Z \
  --dry-run
```

Omit `--dry-run` only after preflight review. Prefer the GUI bulk path for multi-issue imports.

## Admin API

Optional aggregate view via `CURSOR_ADMIN_API_KEY` (server-only). Documented fields only; **no** issue/phase score writes. `cursor_admin_api_deterministic_attribution_proven` remains false.

## Forbidden

Do not use `cursor.com/api/dashboard/export-usage-events-csv` or browser cookie auth.

## Canary

```bash
# Offline / staged validation only (no Langfuse writes)
npm run evaluation:canary-cursor-usage-import

# Live apply: requires Langfuse credentials. Creates disposable deterministic
# traces before import — no operator-created traces required.
npm run evaluation:canary-cursor-usage-import -- --apply
```

Dry mode = staged validation. `--apply` self-seeds planning + plan_review traces, then imports and verifies scores.

## Browser E2E

```bash
npm run test:cursor-usage:browser
```

This is separate from `npm test` and `test:operator:browser`.
