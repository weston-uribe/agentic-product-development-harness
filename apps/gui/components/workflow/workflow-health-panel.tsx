"use client";

import type { WorkflowBootstrapPayload } from "@harness/workflow-page/types";
import {
  countUnhealthyStatuses,
  isWorkflowGloballyHealthy,
} from "@/lib/workflow/workflow-health";

type WorkflowHealthPanelProps = {
  bootstrap: WorkflowBootstrapPayload;
};

export function WorkflowHealthPanel({ bootstrap }: WorkflowHealthPanelProps) {
  const healthy = isWorkflowGloballyHealthy(bootstrap);
  const unhealthyCount = countUnhealthyStatuses(
    bootstrap.canonicalWorkflow.violations,
  );
  const linearUnavailable =
    bootstrap.canonicalWorkflow.healthState === "linear-unavailable";

  const toneClass = healthy
    ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
    : linearUnavailable
      ? "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-200"
      : "border-destructive/40 bg-destructive/5 text-destructive";

  return (
    <section aria-label="Workflow health" className={`rounded-md border p-3 ${toneClass}`}>
      <p className="text-sm font-medium">
        Workflow health: {healthy ? "Healthy" : "Needs attention"}
      </p>
      {!healthy && unhealthyCount > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {unhealthyCount} {unhealthyCount === 1 ? "status needs" : "statuses need"}{" "}
          attention
        </p>
      ) : null}
      {!healthy && linearUnavailable && unhealthyCount === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Linear is unavailable.</p>
      ) : null}
    </section>
  );
}
