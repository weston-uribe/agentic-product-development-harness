"use client";

import { useCallback, useEffect, useState } from "react";
import type { RemoteTargetWorkflowApplyResult } from "@harness/setup/remote-actions";
import type { RemoteSetupSummary } from "@harness/setup/remote-setup-summary";
import type { RemoteWorkflowStatus } from "@harness/setup/remote-actions";

import { SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { SectionCard } from "@/components/custom/section-card";
import { TargetWorkflowPrCard } from "@/components/custom/target-workflow-pr-card";
import {
  WorkflowInstallPendingPanel,
  WorkflowInstallReadyPanel,
} from "@/components/custom/workflow-install-pending-panel";

interface GuidedTargetWorkflowCardProps {
  initialSummary: RemoteSetupSummary;
  onSummaryUpdated?: (summary: RemoteSetupSummary) => void;
  onWorkflowSetupComplete?: () => void;
  onWorkflowAwaitingMergeChange?: (awaiting: boolean) => void;
  pendingInstallByRepo?: Record<string, RemoteTargetWorkflowApplyResult>;
  onPendingInstallChange?: (
    pending: Record<string, RemoteTargetWorkflowApplyResult>,
  ) => void;
  blockedByUpstream?: boolean;
}

function workflowStatusLabel(status: RemoteWorkflowStatus): string {
  switch (status) {
    case "present":
      return "workflow ready";
    case "missing":
      return "workflow missing";
    case "differs":
      return "workflow outdated";
    default:
      return "workflow status unknown";
  }
}

function allTargetWorkflowsReady(summary: RemoteSetupSummary): boolean {
  return (
    summary.targetRepos.length > 0 &&
    summary.targetRepos.every((repo) => repo.workflowStatus === "present")
  );
}

function isPendingInstallResult(
  result: RemoteTargetWorkflowApplyResult,
): boolean {
  return (
    result.outcome === "pr-created" ||
    result.outcome === "pr-updated" ||
    result.outcome === "branch-updated"
  );
}

export function GuidedTargetWorkflowCard({
  initialSummary,
  onSummaryUpdated,
  onWorkflowSetupComplete,
  onWorkflowAwaitingMergeChange,
  pendingInstallByRepo = {},
  onPendingInstallChange,
  blockedByUpstream = false,
}: GuidedTargetWorkflowCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  const refreshSummary = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/setup/remote-summary");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Remote summary refresh failed");
      }
      const nextSummary = data as RemoteSetupSummary;
      setSummary(nextSummary);
      onSummaryUpdated?.(nextSummary);

      if (allTargetWorkflowsReady(nextSummary)) {
        onPendingInstallChange?.({});
        onWorkflowAwaitingMergeChange?.(false);
        onWorkflowSetupComplete?.();
        return nextSummary;
      }

      const nextPending = { ...pendingInstallByRepo };
      for (const repo of nextSummary.targetRepos) {
        if (repo.workflowStatus === "present") {
          delete nextPending[repo.repoConfigId];
        }
      }
      if (Object.keys(nextPending).length !== Object.keys(pendingInstallByRepo).length) {
        onPendingInstallChange?.(nextPending);
      }
      onWorkflowAwaitingMergeChange?.(Object.keys(nextPending).length > 0);
      return nextSummary;
    } finally {
      setRefreshing(false);
    }
  }, [
    onPendingInstallChange,
    onSummaryUpdated,
    onWorkflowAwaitingMergeChange,
    onWorkflowSetupComplete,
    pendingInstallByRepo,
  ]);

  useEffect(() => {
    if (allTargetWorkflowsReady(summary)) {
      onWorkflowSetupComplete?.();
    }
  }, [onWorkflowSetupComplete, summary]);

  useEffect(() => {
    onWorkflowAwaitingMergeChange?.(
      Object.values(pendingInstallByRepo).some(isPendingInstallResult),
    );
  }, [onWorkflowAwaitingMergeChange, pendingInstallByRepo]);

  const handleGuidedApplySuccess = useCallback(
    async (
      repoConfigId: string,
      result: RemoteTargetWorkflowApplyResult,
    ) => {
      let nextPending = { ...pendingInstallByRepo };

      if (result.outcome === "already-installed") {
        delete nextPending[repoConfigId];
      } else if (isPendingInstallResult(result)) {
        nextPending[repoConfigId] = result;
      }

      onPendingInstallChange?.(nextPending);
      onWorkflowAwaitingMergeChange?.(
        Object.values(nextPending).some(isPendingInstallResult),
      );

      setRefreshing(true);
      try {
        const response = await fetch("/api/setup/remote-summary");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Remote summary refresh failed");
        }
        const nextSummary = data as RemoteSetupSummary;
        setSummary(nextSummary);
        onSummaryUpdated?.(nextSummary);

        if (allTargetWorkflowsReady(nextSummary)) {
          onPendingInstallChange?.({});
          onWorkflowAwaitingMergeChange?.(false);
          onWorkflowSetupComplete?.();
          return;
        }

        const clearedPending = { ...nextPending };
        for (const repo of nextSummary.targetRepos) {
          if (repo.workflowStatus === "present") {
            delete clearedPending[repo.repoConfigId];
          }
        }
        onPendingInstallChange?.(clearedPending);
        onWorkflowAwaitingMergeChange?.(
          Object.values(clearedPending).some(isPendingInstallResult),
        );
      } finally {
        setRefreshing(false);
      }
    },
    [
      onPendingInstallChange,
      onSummaryUpdated,
      onWorkflowAwaitingMergeChange,
      onWorkflowSetupComplete,
      pendingInstallByRepo,
    ],
  );

  const awaitingMerge = Object.values(pendingInstallByRepo).some(
    isPendingInstallResult,
  );

  return (
    <SectionCard
      title={`Step 5 of ${GUIDED_SETUP_STEP_COUNT} · Install target repo workflow`}
      description={
        awaitingMerge
          ? "Workflow install PR created. Merge it in GitHub, then refresh status here."
          : "Now we'll add a GitHub Actions workflow to each target repo so future harness runs can be triggered safely."
      }
    >
      <div className={SPACING.stackSm}>
        {awaitingMerge ? (
          <p className="text-sm text-muted-foreground">
            Setup is waiting on GitHub. Merge the workflow install PR, then use
            Refresh status to continue.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            The target repo does not yet have the expected harness workflow, or
            the workflow file is outdated. Each install creates or updates an
            install branch and opens or reuses a PR. Nothing is merged to main
            automatically.
          </p>
        )}

        {summary.targetRepos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Resolve your local harness config to show target repo workflow cards.
          </p>
        ) : (
          <div className={SPACING.stackSm}>
            {summary.targetRepos.map((repo) => {
              const pending = pendingInstallByRepo[repo.repoConfigId];
              const workflowReady = repo.workflowStatus === "present";

              return (
                <div
                  key={repo.repoConfigId}
                  className="rounded-md border border-border bg-background p-4 space-y-3"
                >
                  <div>
                    <p className="text-sm font-medium">{repo.repoConfigId}</p>
                    <p className="text-sm text-muted-foreground break-all">
                      {repo.targetRepo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Status: {workflowStatusLabel(repo.workflowStatus)}
                    </p>
                  </div>

                  {workflowReady ? (
                    <WorkflowInstallReadyPanel repoConfigId={repo.repoConfigId} />
                  ) : pending && isPendingInstallResult(pending) ? (
                    <WorkflowInstallPendingPanel
                      applyResult={pending}
                      onRefresh={() => void refreshSummary()}
                      refreshing={refreshing}
                    />
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Create or update an install branch and open/reuse a PR.
                        Nothing is merged to main.
                      </p>
                      <TargetWorkflowPrCard
                        repo={repo}
                        variant="guided"
                        onApplied={() => undefined}
                        onGuidedApplySuccess={(result) =>
                          void handleGuidedApplySuccess(repo.repoConfigId, result)
                        }
                        blockedByUpstream={blockedByUpstream}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
