"use client";

import type { TargetWorkflowFinalizationResult } from "@harness/setup/target-workflow-finalization-types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";

interface WorkflowInstallProgressPanelProps {
  finalization: TargetWorkflowFinalizationResult;
  onRetry?: () => void;
  retrying?: boolean;
}

function lifecycleLabel(lifecycle: TargetWorkflowFinalizationResult["lifecycle"]): string {
  switch (lifecycle) {
    case "preparing":
      return "Creating workflow install";
    case "pr-created":
    case "pr-updated":
      return "Workflow install PR ready";
    case "waiting-for-checks":
      return "Waiting for checks";
    case "updating-branch":
      return "Updating install branch";
    case "merging":
      return "Merging automatically";
    case "verifying":
      return "Verifying workflow";
    case "complete":
      return "Workflow installed";
    case "blocked":
      return "Workflow install blocked";
    default:
      return "Finalizing workflow install";
  }
}

function lifecycleVariant(
  lifecycle: TargetWorkflowFinalizationResult["lifecycle"],
): "success" | "warning" | "destructive" | "secondary" {
  if (lifecycle === "complete") {
    return "success";
  }
  if (lifecycle === "blocked") {
    return "destructive";
  }
  if (lifecycle === "waiting-for-checks" || lifecycle === "verifying") {
    return "warning";
  }
  return "secondary";
}

export function WorkflowInstallProgressPanel({
  finalization,
  onRetry,
  retrying = false,
}: WorkflowInstallProgressPanelProps) {
  const blocked = finalization.lifecycle === "blocked";
  const complete = finalization.lifecycle === "complete";

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={lifecycleLabel(finalization.lifecycle)}
          variant={lifecycleVariant(finalization.lifecycle)}
        />
      </div>
      <p className="text-sm text-muted-foreground">{finalization.message}</p>

      {blocked ? (
        <div className="flex flex-wrap gap-2">
          {finalization.canRetry && onRetry ? (
            <Button type="button" onClick={onRetry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry finalization"}
            </Button>
          ) : null}
          {finalization.requiresGitHubIntervention && finalization.prUrl ? (
            <Button asChild variant="outline">
              <a
                href={finalization.prUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open GitHub details
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      {!blocked && !complete && finalization.prUrl ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Advanced details</summary>
          <p className="mt-2 break-all">Install PR: {finalization.prUrl}</p>
        </details>
      ) : null}
    </div>
  );
}

interface WorkflowInstallReadyPanelProps {
  repoConfigId: string;
}

export function WorkflowInstallReadyPanel({
  repoConfigId,
}: WorkflowInstallReadyPanelProps) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
      <StatusBadge label="Workflow ready" variant="success" />
      <p className="text-sm text-muted-foreground">
        {repoConfigId} has the expected harness workflow on its production branch.
      </p>
    </div>
  );
}
