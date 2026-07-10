"use client";

import type { RemoteTargetWorkflowApplyResult } from "@harness/setup/remote-actions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";

interface WorkflowInstallPendingPanelProps {
  applyResult: RemoteTargetWorkflowApplyResult;
  onRefresh: () => void;
  refreshing?: boolean;
}

export function WorkflowInstallPendingPanel({
  applyResult,
  onRefresh,
  refreshing = false,
}: WorkflowInstallPendingPanelProps) {
  const prCreated =
    applyResult.outcome === "pr-created" || applyResult.outcome === "pr-updated";

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={
            prCreated ? "Workflow install PR created" : "Workflow install updated"
          }
          variant="success"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {prCreated
          ? "The workflow install PR was created. Review and merge it in GitHub before production automation can run."
          : "The install branch was updated. Open the workflow install PR in GitHub if one exists, merge it when ready, then return here."}
      </p>
      <p className="text-sm text-muted-foreground">
        Merge the PR in GitHub, then return here and refresh status.
      </p>
      <div className="flex flex-wrap gap-2">
        {applyResult.prUrl ? (
          <Button asChild>
            <a
              href={applyResult.prUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open workflow install PR
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh status"}
        </Button>
      </div>
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
