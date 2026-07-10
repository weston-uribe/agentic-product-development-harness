"use client";

import { useCallback, useEffect, useState } from "react";
import type { RemoteSetupSummary } from "@harness/setup/remote-setup-summary";
import type { RemoteWorkflowStatus } from "@harness/setup/remote-actions";

import { SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { SectionCard } from "@/components/custom/section-card";
import { TargetWorkflowPrCard } from "@/components/custom/target-workflow-pr-card";

interface GuidedTargetWorkflowCardProps {
  initialSummary: RemoteSetupSummary;
  onSummaryUpdated?: (summary: RemoteSetupSummary) => void;
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

export function GuidedTargetWorkflowCard({
  initialSummary,
  onSummaryUpdated,
  blockedByUpstream = false,
}: GuidedTargetWorkflowCardProps) {
  const [summary, setSummary] = useState(initialSummary);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  const refreshSummary = useCallback(async () => {
    const response = await fetch("/api/setup/remote-summary");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Remote summary refresh failed");
    }
    setSummary(data as RemoteSetupSummary);
    onSummaryUpdated?.(data as RemoteSetupSummary);
  }, [onSummaryUpdated]);

  return (
    <SectionCard
      title={`Step 5 of ${GUIDED_SETUP_STEP_COUNT} · Install target repo workflow`}
      description="Now we'll add a GitHub Actions workflow to each target repo so future harness runs can be triggered safely."
    >
      <div className={SPACING.stackSm}>
        <p className="text-sm text-muted-foreground">
          The target repo does not yet have the expected harness workflow, or
          the workflow file is outdated. Each install creates or updates an
          install branch and opens or reuses a PR. Nothing is merged to main.
        </p>

        {summary.targetRepos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Resolve your local harness config to show target repo workflow cards.
          </p>
        ) : (
          <div className={SPACING.stackSm}>
            {summary.targetRepos.map((repo) => (
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
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create or update an install branch and open/reuse a PR.
                    Nothing is merged to main.
                  </p>
                </div>
                <TargetWorkflowPrCard
                  repo={repo}
                  variant="guided"
                  onApplied={() => void refreshSummary()}
                  blockedByUpstream={blockedByUpstream}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
