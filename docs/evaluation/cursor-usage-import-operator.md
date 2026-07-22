# Cursor usage import (operator guide)

Bulk import of Cursor usage CSV into Langfuse as **score-only** enrichment on existing harness phase traces.

## What this does / does not do

| Does | Does not |
|------|----------|
| Attach deterministic token/cost proxy scores to agent-invoking phase traces | Mutate historical Langfuse observations or recreate traces |
| Use Cloud Agent ID → Cursor Agent ID join | Treat Admin API events as issue/phase attribution (aggregate-only under current docs) |
| Require an explicit Cursor export window for source-scope completeness | Invent export bounds from the first/last CSV row |
| Keep private Cloud Agent IDs in server-side staged artifacts only | Fix the native Langfuse generation cost dashboard |

Native `generationCostComplete` / `cursor_exact_cost_complete` remain false until Cursor reports truthful generation usage.

## Primary workflow (GUI)

1. Start the operator GUI (`npm start` / `p-dev`) from a workspace with Langfuse configured.
2. Open **Settings → Cursor usage**.
3. Drag-and-drop an official Cursor usage CSV (≤ 25 MiB).
4. Enter the **export start** and **export end** from the Cursor export UI (required).
5. Run **Preflight**. Review matched / conflict / unresolved rows.
6. Apply is disabled when source scope is incomplete or conflicts exist.
7. Confirm and **Apply**. Refresh-safe: state is recovered from durable staging/ledger.
8. Use **Analytics** for local-ledger completeness (not organization-wide unless every machine’s ledger is present).

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
npm run evaluation:canary-cursor-usage-import
npm run evaluation:canary-cursor-usage-import -- --apply   # live, when creds + traces exist
```

## Browser E2E

```bash
npm run test:cursor-usage:browser
```

This is separate from `npm test` and `test:operator:browser`.
