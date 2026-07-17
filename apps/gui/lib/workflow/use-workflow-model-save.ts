"use client";

import { useCallback, useRef, useState } from "react";
import type { RoleModelRole } from "@harness/config/role-models";
import type { WorkflowModelSelection } from "@harness/workflow-page/types";
import { saveWorkflowModel } from "@/lib/workflow/api-client";

export type WorkflowModelPhaseKey = "planning" | "implementation";

export type ModelSaveState = "idle" | "saving" | "saved" | "error";

export type ModelSaveError = {
  code?: string;
  message: string;
};

const AUTOSAVE_DELAY_MS = 400;

function phaseToRole(phaseKey: WorkflowModelPhaseKey): RoleModelRole {
  return phaseKey === "planning" ? "planner" : "builder";
}

export type WorkflowModelSaveContext = {
  sourceMode: "live" | "fixture";
  fixtureId?: string;
  selectedScopeId?: string;
  configFingerprint: string;
};

export type UseWorkflowModelSaveOptions = {
  context: WorkflowModelSaveContext;
  committedSelections: Record<RoleModelRole, WorkflowModelSelection>;
  onCommittedSelectionChange: (
    role: RoleModelRole,
    selection: WorkflowModelSelection,
  ) => void;
  onFingerprintChange: (fingerprint: string) => void;
};

export function useWorkflowModelSave({
  context,
  committedSelections,
  onCommittedSelectionChange,
  onFingerprintChange,
}: UseWorkflowModelSaveOptions) {
  const [optimisticSelections, setOptimisticSelections] = useState(
    committedSelections,
  );
  const [saveState, setSaveState] = useState<
    Record<WorkflowModelPhaseKey, ModelSaveState>
  >({
    planning: "idle",
    implementation: "idle",
  });
  const [saveErrors, setSaveErrors] = useState<
    Partial<Record<WorkflowModelPhaseKey, ModelSaveError>>
  >({});
  const timersRef = useRef<
    Partial<Record<WorkflowModelPhaseKey, ReturnType<typeof setTimeout>>>
  >({});
  const fingerprintRef = useRef(context.configFingerprint);
  const generationRef = useRef<Record<WorkflowModelPhaseKey, number>>({
    planning: 0,
    implementation: 0,
  });

  fingerprintRef.current = context.configFingerprint;

  const revertToCommitted = useCallback(
    (phaseKey: WorkflowModelPhaseKey) => {
      const role = phaseToRole(phaseKey);
      const committed = committedSelections[role];
      setOptimisticSelections((current) => ({
        ...current,
        [role]: committed,
      }));
    },
    [committedSelections],
  );

  const runSave = useCallback(
  async (
    phaseKey: WorkflowModelPhaseKey,
    selection: WorkflowModelSelection,
    generation: number,
  ) => {
    const role = phaseToRole(phaseKey);
    try {
      const result = await saveWorkflowModel({
        role,
        modelId: selection.modelId,
        params: selection.parameters,
        expectedConfigFingerprint: fingerprintRef.current,
        sourceMode: context.sourceMode,
        fixtureId: context.fixtureId,
        scopeId: context.selectedScopeId,
        sequenceId: generation,
      });
      if (generation !== generationRef.current[phaseKey]) {
        return;
      }
      fingerprintRef.current = result.configFingerprint;
      onFingerprintChange(result.configFingerprint);
      onCommittedSelectionChange(role, selection);
      setSaveState((current) => ({ ...current, [phaseKey]: "saved" }));
      setSaveErrors((current) => {
        const next = { ...current };
        delete next[phaseKey];
        return next;
      });
    } catch (error) {
      if (generation !== generationRef.current[phaseKey]) {
        return;
      }
      revertToCommitted(phaseKey);
      setSaveState((current) => ({ ...current, [phaseKey]: "error" }));
      const response =
        error instanceof Error && "code" in error
          ? (error as Error & { code?: string })
          : error;
      setSaveErrors((current) => ({
        ...current,
        [phaseKey]: {
          code:
            typeof response === "object" &&
            response &&
            "code" in response &&
            typeof response.code === "string"
              ? response.code
              : undefined,
          message:
            error instanceof Error
              ? error.message
              : "Couldn't save model settings.",
        },
      }));
    }
  },
  [
    context.fixtureId,
    context.selectedScopeId,
    context.sourceMode,
    onCommittedSelectionChange,
    onFingerprintChange,
    revertToCommitted,
  ],
  );

  const scheduleSave = useCallback(
    (phaseKey: WorkflowModelPhaseKey, selection: WorkflowModelSelection) => {
      const existingTimer = timersRef.current[phaseKey];
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      setSaveState((current) => ({ ...current, [phaseKey]: "saving" }));
      setSaveErrors((current) => {
        const next = { ...current };
        delete next[phaseKey];
        return next;
      });

      timersRef.current[phaseKey] = setTimeout(() => {
        const generation = generationRef.current[phaseKey] + 1;
        generationRef.current[phaseKey] = generation;
        void runSave(phaseKey, selection, generation);
      }, AUTOSAVE_DELAY_MS);
    },
    [runSave],
  );

  const retrySave = useCallback(
    (phaseKey: WorkflowModelPhaseKey) => {
      const role = phaseToRole(phaseKey);
      const selection = optimisticSelections[role];
      scheduleSave(phaseKey, selection);
    },
    [optimisticSelections, scheduleSave],
  );

  const handleModelSelect = useCallback(
    (
      phaseKey: WorkflowModelPhaseKey,
      modelId: string,
      modelCatalog: Array<{
        id: string;
        supportedParameters: Array<{
          id: string;
          type: string;
          defaultValue?: string;
        }>;
      }>,
    ) => {
      const role = phaseToRole(phaseKey);
      const model = modelCatalog.find((entry) => entry.id === modelId);
      const defaultParams =
        model?.supportedParameters
          .filter((parameter) => parameter.type === "boolean")
          .map((parameter) => ({
            id: parameter.id,
            value: parameter.defaultValue ?? "false",
          })) ?? [];
      const nextSelection: WorkflowModelSelection = {
        modelId,
        displayName: model?.id ?? modelId,
        parameters: defaultParams,
        source: "roleModels",
      };
      setOptimisticSelections((current) => ({ ...current, [role]: nextSelection }));
      scheduleSave(phaseKey, nextSelection);
    },
    [scheduleSave],
  );

  const handleModelParameter = useCallback(
    (phaseKey: WorkflowModelPhaseKey, parameterId: string, value: string) => {
      const role = phaseToRole(phaseKey);
      const current = optimisticSelections[role];
      const nextSelection: WorkflowModelSelection = {
        ...current,
        parameters: [
          ...current.parameters.filter((entry) => entry.id !== parameterId),
          { id: parameterId, value },
        ],
      };
      setOptimisticSelections((currentState) => ({
        ...currentState,
        [role]: nextSelection,
      }));
      scheduleSave(phaseKey, nextSelection);
    },
    [optimisticSelections, scheduleSave],
  );

  const syncCommittedSelections = useCallback(
    (nextCommitted: Record<RoleModelRole, WorkflowModelSelection>) => {
      setOptimisticSelections(nextCommitted);
    },
    [],
  );

  const saveStateLabel = (phaseKey: WorkflowModelPhaseKey): string | null => {
    switch (saveState[phaseKey]) {
      case "saving":
        return "Saving…";
      case "saved":
        return "Saved";
      case "error":
        return "Couldn't save. Your previous model is still active.";
      default:
        return null;
    }
  };

  return {
    optimisticSelections,
    saveState,
    saveErrors,
    handleModelSelect,
    handleModelParameter,
    retrySave,
    saveStateLabel,
    syncCommittedSelections,
  };
}
