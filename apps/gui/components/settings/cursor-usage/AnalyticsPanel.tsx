"use client";

import type { AnalyticsResponse } from "@/lib/cursor-usage-client";

interface AnalyticsPanelProps {
  analytics: AnalyticsResponse | null;
}

const LOCAL_LABELS: Record<
  AnalyticsResponse["localEvidenceCompleteness"],
  string
> = {
  complete: "Complete (verified local ledgers)",
  partial: "Partial",
  none: "None",
};

const LANGFUSE_LABELS: Record<
  AnalyticsResponse["langfuseReconciliationStatus"],
  string
> = {
  not_run: "Not run",
  unavailable: "Unavailable",
  complete: "Complete",
  divergent: "Divergent",
};

export function AnalyticsPanel({ analytics }: AnalyticsPanelProps) {
  if (!analytics) {
    return null;
  }

  return (
    <div
      className="rounded-md border p-4 text-sm"
      data-testid="cursor-usage-analytics-panel"
    >
      <h3 className="font-medium">Analytics</h3>
      <p className="mt-2 text-muted-foreground">
        Totals cover only ledgers in the current operator workspace.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Local evidence</dt>
          <dd data-testid="cursor-usage-analytics-local-evidence">
            {LOCAL_LABELS[analytics.localEvidenceCompleteness]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Langfuse reconciliation</dt>
          <dd data-testid="cursor-usage-analytics-langfuse-status">
            {LANGFUSE_LABELS[analytics.langfuseReconciliationStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Imports</dt>
          <dd>{analytics.ledgerCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Verified imports</dt>
          <dd>{analytics.verifiedCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Incomplete imports</dt>
          <dd>{analytics.incompleteCount ?? 0}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total bundles</dt>
          <dd>{analytics.totalBundles}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total scores</dt>
          <dd>{analytics.totalScores}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Unresolved segments</dt>
          <dd>{analytics.unresolvedSegmentCount ?? 0}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pricing-incomplete segments</dt>
          <dd>{analytics.pricingIncompleteSegmentCount ?? 0}</dd>
        </div>
      </dl>
    </div>
  );
}
