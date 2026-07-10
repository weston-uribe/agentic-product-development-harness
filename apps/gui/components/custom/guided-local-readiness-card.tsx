"use client";

import { useCallback, useEffect, useState } from "react";
import type { FirstRunReadiness } from "@harness/setup/first-run-readiness";
import type { LocalReadinessCheckResult } from "@harness/setup/local-readiness-checks";

import { SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/custom/section-card";
import {
  LocalReadinessChecklist,
  type LocalReadinessUiStatus,
} from "@/components/custom/setup-checklist";

interface GuidedLocalReadinessCardProps {
  readiness: FirstRunReadiness;
  onContinue: () => void;
}

interface UiCheckRow {
  id: string;
  label: string;
  status: LocalReadinessUiStatus;
  detail?: string;
  action?: string;
}

function mapResultToUi(
  results: LocalReadinessCheckResult[],
): UiCheckRow[] {
  return results.map((check) => ({
    id: check.id,
    label: check.label,
    status: check.status === "passed" ? "passed" : "failed",
    detail: check.detail,
    action: check.action,
  }));
}

export function GuidedLocalReadinessCard({
  readiness,
  onContinue,
}: GuidedLocalReadinessCardProps) {
  const [checks, setChecks] = useState<UiCheckRow[]>([]);
  const [running, setRunning] = useState(true);
  const [runError, setRunError] = useState<string | null>(null);
  const [allPassed, setAllPassed] = useState(false);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setAllPassed(false);
    setChecks([]);

    try {
      const response = await fetch("/api/setup/local-readiness");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Local readiness check failed");
      }

      const results = data.checks as LocalReadinessCheckResult[];
      setChecks(
        results.map((check) => ({
          id: check.id,
          label: check.label,
          status: "checking" as const,
        })),
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      setChecks(mapResultToUi(results));
      setAllPassed(Boolean(data.allPassed));
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : "Could not run local readiness checks",
      );
      setChecks([]);
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const canContinue =
    allPassed && !running && !readiness.localReadinessReviewed;

  return (
    <SectionCard
      title={`Step 5 of ${GUIDED_SETUP_STEP_COUNT} · Check local readiness`}
      description="We're checking whether this machine is ready for remote setup."
    >
      <div className={SPACING.stackSm}>
        {running && checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Running local readiness checks…
          </p>
        ) : null}

        {runError ? (
          <div className={SPACING.stackSm}>
            <p className="text-sm text-destructive">{runError}</p>
            <Button type="button" variant="outline" onClick={() => void runChecks()}>
              Retry checks
            </Button>
          </div>
        ) : null}

        {checks.length > 0 ? <LocalReadinessChecklist checks={checks} /> : null}

        {allPassed && !running ? (
          <p className="text-sm font-medium text-emerald-700">
            Local readiness passed.
          </p>
        ) : null}

        {canContinue ? (
          <Button type="button" onClick={onContinue}>
            Continue to cloud secrets
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
}
