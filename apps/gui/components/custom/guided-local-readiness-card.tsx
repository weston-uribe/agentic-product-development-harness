"use client";

import { useEffect, useState } from "react";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { FirstRunReadiness } from "@harness/setup/first-run-readiness";

import { SPACING } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/custom/section-card";
import { DoctorChecklist } from "@/components/custom/setup-checklist";

const GUIDED_STEP_COUNT = 4;

interface GuidedLocalReadinessCardProps {
  summary: SetupGuiViewModel;
  readiness: FirstRunReadiness;
  onSummaryUpdated?: (summary: SetupGuiViewModel) => void;
  onContinue: () => void;
}

export function GuidedLocalReadinessCard({
  summary,
  readiness,
  onSummaryUpdated,
  onContinue,
}: GuidedLocalReadinessCardProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshSummary() {
      setRefreshing(true);
      setRefreshError(null);
      try {
        const response = await fetch("/api/setup/summary");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Summary refresh failed");
        }
        if (!cancelled) {
          onSummaryUpdated?.(data as SetupGuiViewModel);
        }
      } catch (error) {
        if (!cancelled) {
          setRefreshError(
            error instanceof Error
              ? error.message
              : "Could not refresh local readiness checks",
          );
        }
      } finally {
        if (!cancelled) {
          setRefreshing(false);
        }
      }
    }

    void refreshSummary();

    return () => {
      cancelled = true;
    };
  }, [onSummaryUpdated]);

  const hasSkippedChecks = summary.doctor.checks.some((check) => check.skipped);
  const localReadinessBlocker =
    readiness.highestPriorityBlocker?.stepId === "local-readiness"
      ? readiness.highestPriorityBlocker
      : undefined;

  return (
    <SectionCard
      title={`Step 3 of ${GUIDED_STEP_COUNT} · Check local readiness`}
      description="Local setup files were created. Now we'll check whether this machine is ready to run the harness."
    >
      <div className={SPACING.stackSm}>
        <p className="text-sm text-muted-foreground">
          This step runs automatic checks against your local files and harness
          config. Review the results below before continuing to remote setup.
        </p>

        {refreshing ? (
          <p className="text-sm text-muted-foreground">Running local checks…</p>
        ) : null}

        {refreshError ? (
          <p className="text-sm text-destructive">{refreshError}</p>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-medium">Local readiness checks</p>
          <DoctorChecklist checks={summary.doctor.checks} />
        </div>

        {hasSkippedChecks ? (
          <p className="text-sm text-muted-foreground">
            Some checks require running{" "}
            <code className="text-xs">npm run harness:doctor</code> in your
            terminal. The checks above cover local files and config; the CLI
            doctor adds live provider validation when you are ready.
          </p>
        ) : null}

        {localReadinessBlocker ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium">Fix before continuing</p>
            <p className="text-sm text-muted-foreground">
              {localReadinessBlocker.action.replace(/^Next:\s*/, "")}
            </p>
          </div>
        ) : null}

        {readiness.localReadinessBlockersCleared &&
        !readiness.localReadinessReviewed ? (
          <Button type="button" onClick={onContinue}>
            Continue to remote setup
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
}
