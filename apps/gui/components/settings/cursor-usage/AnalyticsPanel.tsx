"use client";

import type { AnalyticsResponse } from "@/lib/cursor-usage-client";

interface AnalyticsPanelProps {
  analytics: AnalyticsResponse | null;
}

const COMPLETENESS_LABELS: Record<AnalyticsResponse["completeness"], string> = {
  local_ledger: "Local ledger (import staging)",
  langfuse: "Langfuse-connected",
  partial: "Partial / mixed",
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
        Source of truth:{" "}
        <span
          className="font-medium text-foreground"
          data-testid="cursor-usage-analytics-completeness"
        >
          {COMPLETENESS_LABELS[analytics.completeness]}
        </span>
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Imports</dt>
          <dd>{analytics.ledgerCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Verified imports</dt>
          <dd>{analytics.verifiedCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total bundles</dt>
          <dd>{analytics.totalBundles}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total scores</dt>
          <dd>{analytics.totalScores}</dd>
        </div>
      </dl>
    </div>
  );
}
