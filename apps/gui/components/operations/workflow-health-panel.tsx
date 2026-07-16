"use client";

import type { OperationsBootstrapPayload } from "@harness/operations/types";

type WorkflowHealthPanelProps = {
  bootstrap: OperationsBootstrapPayload;
};

const HEALTH_LABELS = {
  healthy: "Healthy",
  "blocking-configuration-error": "Blocking configuration error",
  "linear-unavailable": "Linear unavailable",
} as const;

export function WorkflowHealthPanel({ bootstrap }: WorkflowHealthPanelProps) {
  const { healthState, mergePathVariant } = bootstrap.canonicalWorkflow;
  const label = HEALTH_LABELS[healthState];

  const toneClass =
    healthState === "healthy"
      ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
      : healthState === "linear-unavailable"
        ? "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-200"
        : "border-destructive/40 bg-destructive/5 text-destructive";

  return (
    <section aria-label="Workflow health" className={`rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Workflow health</h2>
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Merge path:{" "}
        {mergePathVariant === "direct-production"
          ? "Ready to Merge → Merging → Merged / Deployed"
          : "Ready to Merge → Merging → Merged to Dev → Merged / Deployed"}
      </p>
      {healthState !== "healthy" && bootstrap.canonicalWorkflow.violations.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs">
          {bootstrap.canonicalWorkflow.violations.slice(0, 4).map((violation, index) => (
            <li key={`${violation.kind}-${index}`}>{violation.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
