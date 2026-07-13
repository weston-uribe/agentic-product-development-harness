"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RemoteTargetWorkflowApplyResult } from "@harness/setup/remote-actions";
import type { RemoteSetupSummary } from "@harness/setup/remote-setup-summary";
import type { RemoteWorkflowStatus } from "@harness/setup/remote-actions";
import type { TargetWorkflowFinalizationResult } from "@harness/setup/target-workflow-finalization-types";
import { WORKFLOW_INSTALL_SHORT_POLL_INTERVAL_MS } from "@harness/setup/target-workflow-finalization-types";

import { SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { SectionCard } from "@/components/custom/section-card";
import { TargetWorkflowPrCard } from "@/components/custom/target-workflow-pr-card";
import {
  WorkflowInstallProgressPanel,
  WorkflowInstallReadyPanel,
} from "@/components/custom/workflow-install-pending-panel";

interface GuidedTargetWorkflowCardProps {
  initialSummary: RemoteSetupSummary;
  onSummaryUpdated?: (summary: RemoteSetupSummary) => void;
  onWorkflowSetupComplete?: () => void;
  onWorkflowAwaitingMergeChange?: (awaiting: boolean) => void;
  pendingInstallByRepo?: Record<string, RemoteTargetWorkflowApplyResult>;
  finalizationByRepo?: Record<string, TargetWorkflowFinalizationResult>;
  onPendingInstallChange?: (
    pending: Record<string, RemoteTargetWorkflowApplyResult>,
  ) => void;
  onFinalizationChange?: (
    finalization: Record<string, TargetWorkflowFinalizationResult>,
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

function shouldContinuePolling(
  finalization: TargetWorkflowFinalizationResult | undefined,
): boolean {
  if (!finalization) {
    return false;
  }
  if (finalization.lifecycle === "complete") {
    return false;
  }
  if (finalization.lifecycle === "blocked" && !finalization.canRetry) {
    return false;
  }
  return true;
}

function isTerminalFinalization(
  finalization: TargetWorkflowFinalizationResult | undefined,
): boolean {
  return (
    finalization?.lifecycle === "complete" ||
    (finalization?.lifecycle === "blocked" && !finalization.canRetry)
  );
}

export function GuidedTargetWorkflowCard({
  initialSummary,
  onSummaryUpdated,
  onWorkflowSetupComplete,
  onWorkflowAwaitingMergeChange,
  pendingInstallByRepo = {},
  finalizationByRepo = {},
  onPendingInstallChange,
  onFinalizationChange,
  blockedByUpstream = false,
}: GuidedTargetWorkflowCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [localFinalizationByRepo, setLocalFinalizationByRepo] = useState(
    finalizationByRepo,
  );
  const pollGenerationRef = useRef(0);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  useEffect(() => {
    setLocalFinalizationByRepo(finalizationByRepo);
  }, [finalizationByRepo]);

  const refreshSummary = useCallback(async () => {
    const response = await fetch("/api/setup/remote-summary");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Remote summary refresh failed");
    }
    const nextSummary = data as RemoteSetupSummary;
    setSummary(nextSummary);
    onSummaryUpdated?.(nextSummary);
    return nextSummary;
  }, [onSummaryUpdated]);

  const finalizeRepo = useCallback(
    async (repoConfigId: string, apply?: RemoteTargetWorkflowApplyResult) => {
      const repo = summary.targetRepos.find(
        (entry) => entry.repoConfigId === repoConfigId,
      );
      if (!repo) {
        return;
      }

      const response = await fetch("/api/setup/finalize-target-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoConfigId: repo.repoConfigId,
          targetRepo: repo.targetRepo,
          productionBranch: repo.productionBranch,
          prUrl: apply?.prUrl,
          branchName: apply?.branchName,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Workflow finalization failed");
      }

      const finalization = data.finalization as TargetWorkflowFinalizationResult;
      const nextSummary = data.summary as RemoteSetupSummary;

      setLocalFinalizationByRepo((previous) => {
        const existing = previous[repoConfigId];
        if (
          existing &&
          isTerminalFinalization(existing) &&
          !isTerminalFinalization(finalization)
        ) {
          return previous;
        }
        const next = { ...previous, [repoConfigId]: finalization };
        onFinalizationChange?.(next);
        return next;
      });

      setSummary(nextSummary);
      onSummaryUpdated?.(nextSummary);

      if (finalization.lifecycle === "complete") {
        const nextPending = { ...pendingInstallByRepo };
        delete nextPending[repoConfigId];
        onPendingInstallChange?.(nextPending);
      }

      if (allTargetWorkflowsReady(nextSummary)) {
        onPendingInstallChange?.({});
        onWorkflowAwaitingMergeChange?.(false);
        onWorkflowSetupComplete?.();
      }

      return finalization;
    },
    [
      onFinalizationChange,
      onPendingInstallChange,
      onSummaryUpdated,
      onWorkflowAwaitingMergeChange,
      onWorkflowSetupComplete,
      pendingInstallByRepo,
      summary.targetRepos,
    ],
  );

  const startPolling = useCallback(
    (repoConfigId: string, apply?: RemoteTargetWorkflowApplyResult) => {
      const generation = pollGenerationRef.current + 1;
      pollGenerationRef.current = generation;

      const poll = async () => {
        while (pollGenerationRef.current === generation) {
          try {
            const finalization = await finalizeRepo(repoConfigId, apply);
            if (!shouldContinuePolling(finalization)) {
              break;
            }
          } catch {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, WORKFLOW_INSTALL_SHORT_POLL_INTERVAL_MS),
          );
        }
      };

      void poll();
    },
    [finalizeRepo],
  );

  useEffect(() => {
    if (allTargetWorkflowsReady(summary)) {
      onWorkflowSetupComplete?.();
    }
  }, [onWorkflowSetupComplete, summary]);

  useEffect(() => {
    const awaiting = Object.entries(localFinalizationByRepo).some(([, state]) =>
      shouldContinuePolling(state),
    );
    onWorkflowAwaitingMergeChange?.(awaiting);
  }, [localFinalizationByRepo, onWorkflowAwaitingMergeChange]);

  useEffect(() => {
    for (const [repoConfigId, apply] of Object.entries(pendingInstallByRepo)) {
      if (!isPendingInstallResult(apply)) {
        continue;
      }
      const existing = localFinalizationByRepo[repoConfigId];
      if (existing && isTerminalFinalization(existing)) {
        continue;
      }
      if (!existing || shouldContinuePolling(existing)) {
        startPolling(repoConfigId, apply);
      }
    }
  }, [localFinalizationByRepo, pendingInstallByRepo, startPolling]);

  const handleGuidedApplySuccess = useCallback(
    async (
      repoConfigId: string,
      result: RemoteTargetWorkflowApplyResult,
      initialFinalization?: TargetWorkflowFinalizationResult,
    ) => {
      let nextPending = { ...pendingInstallByRepo };

      if (result.outcome === "already-installed") {
        delete nextPending[repoConfigId];
        onPendingInstallChange?.(nextPending);
        await refreshSummary();
        return;
      }

      if (isPendingInstallResult(result)) {
        nextPending[repoConfigId] = result;
      }

      onPendingInstallChange?.(nextPending);

      if (initialFinalization) {
        const next = {
          ...localFinalizationByRepo,
          [repoConfigId]: initialFinalization,
        };
        setLocalFinalizationByRepo(next);
        onFinalizationChange?.(next);
      }

      if (isPendingInstallResult(result)) {
        startPolling(repoConfigId, result);
      }
    },
    [
      localFinalizationByRepo,
      onFinalizationChange,
      onPendingInstallChange,
      pendingInstallByRepo,
      refreshSummary,
      startPolling,
    ],
  );

  const awaitingFinalization = Object.values(localFinalizationByRepo).some(
    (state) => shouldContinuePolling(state),
  );

  return (
    <SectionCard
      title={`Step 7 of ${GUIDED_SETUP_STEP_COUNT} · Install target repo workflow`}
      description={
        awaitingFinalization
          ? "Installing the harness workflow automatically. Setup will continue when production verification succeeds."
          : "The harness will create or reuse a workflow install PR, merge it automatically when GitHub permits, and verify the production workflow."
      }
    >
      <div className={SPACING.stackSm}>
        <p className="text-sm text-muted-foreground">
          Each target repo gets a deterministic install branch and PR. The harness
          finalizes the install automatically when checks and branch protection allow.
        </p>

        {summary.targetRepos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Resolve your local harness config to show target repo workflow cards.
          </p>
        ) : (
          <div className={SPACING.stackSm}>
            {summary.targetRepos.map((repo) => {
              const pending = pendingInstallByRepo[repo.repoConfigId];
              const finalization = localFinalizationByRepo[repo.repoConfigId];
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
                  ) : finalization ? (
                    <WorkflowInstallProgressPanel
                      finalization={finalization}
                      onRetry={
                        finalization.canRetry
                          ? () => void finalizeRepo(repo.repoConfigId, pending)
                          : undefined
                      }
                    />
                  ) : pending && isPendingInstallResult(pending) ? (
                    <WorkflowInstallProgressPanel
                      finalization={{
                        repoConfigId: repo.repoConfigId,
                        targetRepo: repo.targetRepo,
                        targetRepoSlug: repo.targetRepo,
                        productionBranch: repo.productionBranch,
                        branchName: pending.branchName,
                        lifecycle: "preparing",
                        message: "Starting automatic workflow install finalization.",
                        workflowStatus: repo.workflowStatus,
                        canRetry: false,
                        requiresGitHubIntervention: false,
                        advancedThisRequest: false,
                        lockContended: false,
                      }}
                    />
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Preview and confirm to create or update the workflow install
                        PR. Finalization runs automatically after apply.
                      </p>
                      <TargetWorkflowPrCard
                        repo={repo}
                        variant="guided"
                        onApplied={() => undefined}
                        onGuidedApplySuccess={(result, finalization) =>
                          void handleGuidedApplySuccess(
                            repo.repoConfigId,
                            result,
                            finalization,
                          )
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
