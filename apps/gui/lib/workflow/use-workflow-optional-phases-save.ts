"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanReviewReadinessView } from "@harness/workflow-page/types";
import { saveWorkflowOptionalPhases } from "@/lib/workflow/api-client";

export type OptionalPhasesSaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 400;

export type WorkflowOptionalPhasesSaveContext = {
  sourceMode: "live" | "fixture";
  fixtureId?: string;
  selectedScopeId?: string;
  configFingerprint: string;
};

export function useWorkflowOptionalPhasesSave({
  context,
  committedReadiness,
  onCommittedReadinessChange,
  onFingerprintChange,
}: {
  context: WorkflowOptionalPhasesSaveContext;
  committedReadiness: PlanReviewReadinessView;
  onCommittedReadinessChange: (readiness: PlanReviewReadinessView) => void;
  onFingerprintChange: (fingerprint: string) => void;
}) {
  const [optimisticReadiness, setOptimisticReadiness] =
    useState(committedReadiness);
  const [saveState, setSaveState] = useState<OptionalPhasesSaveState>("idle");
  const [saveError, setSaveError] = useState<string | undefined>();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fingerprintRef = useRef(context.configFingerprint);
  const generationRef = useRef(0);

  fingerprintRef.current = context.configFingerprint;

  useEffect(() => {
    setOptimisticReadiness(committedReadiness);
  }, [committedReadiness]);

  const revertToCommitted = useCallback(() => {
    setOptimisticReadiness(committedReadiness);
  }, [committedReadiness]);

  const runSave = useCallback(
    async (readiness: PlanReviewReadinessView, generation: number) => {
      try {
        const result = await saveWorkflowOptionalPhases({
          planReviewEnabled: readiness.requestedEnabled,
          planReviewCycleLimit: readiness.cycleLimit,
          expectedConfigFingerprint: fingerprintRef.current,
          sourceMode: context.sourceMode,
          fixtureId: context.fixtureId,
          scopeId: context.selectedScopeId,
        });
        if (generation !== generationRef.current) {
          return;
        }
        fingerprintRef.current = result.configFingerprint;
        onFingerprintChange(result.configFingerprint);
        onCommittedReadinessChange(readiness);
        setSaveState("saved");
        setSaveError(undefined);
      } catch (error) {
        if (generation !== generationRef.current) {
          return;
        }
        revertToCommitted();
        setSaveState("error");
        setSaveError(
          error instanceof Error
            ? error.message
            : "Couldn't save workflow settings.",
        );
      }
    },
    [
      context.fixtureId,
      context.selectedScopeId,
      context.sourceMode,
      onCommittedReadinessChange,
      onFingerprintChange,
      revertToCommitted,
    ],
  );

  const scheduleSave = useCallback(
    (readiness: PlanReviewReadinessView) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setSaveState("saving");
      setSaveError(undefined);
      timerRef.current = setTimeout(() => {
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        void runSave(readiness, generation);
      }, AUTOSAVE_DELAY_MS);
    },
    [runSave],
  );

  const handlePlanReviewEnabledChange = useCallback(
    (enabled: boolean) => {
      const next: PlanReviewReadinessView = enabled
        ? {
            ...committedReadiness,
            requestedEnabled: true,
            uiState:
              committedReadiness.effectiveEnabled &&
              committedReadiness.missingRequirementMessages.length === 0
                ? "active"
                : "setup_required",
            effectiveEnabled:
              committedReadiness.effectiveEnabled &&
              committedReadiness.missingRequirementMessages.length === 0,
          }
        : {
            ...optimisticReadiness,
            requestedEnabled: false,
            effectiveEnabled: false,
            uiState: "disabled",
            missingRequirementMessages: ["Plan Review is disabled in configuration."],
          };
      setOptimisticReadiness(next);
      scheduleSave(next);
    },
    [committedReadiness, optimisticReadiness, scheduleSave],
  );

  const handlePlanReviewCycleLimitChange = useCallback(
    (cycleLimit: number) => {
      const next: PlanReviewReadinessView = {
        ...optimisticReadiness,
        cycleLimit,
      };
      setOptimisticReadiness(next);
      scheduleSave(next);
    },
    [optimisticReadiness, scheduleSave],
  );

  const syncCommittedReadiness = useCallback((next: PlanReviewReadinessView) => {
    setOptimisticReadiness(next);
  }, []);

  const saveStateLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Couldn't save. Your previous settings are still active."
          : null;

  return {
    planReviewReadiness: optimisticReadiness,
    saveStateLabel,
    saveError,
    handlePlanReviewEnabledChange,
    handlePlanReviewCycleLimitChange,
    syncCommittedReadiness,
  };
}
