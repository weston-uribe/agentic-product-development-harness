"use client";

import { useCallback, useRef, useState } from "react";
import type { RoleModelRole } from "@harness/config/role-models";
import type {
  WorkflowBootstrapPayload,
  WorkflowModelCatalogEntry,
} from "@harness/workflow-page/types";
import { saveWorkflowModel } from "@/lib/workflow/api-client";

export type WorkflowModelPhaseKey = "planning" | "implementation";

export type ModelSaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 400;

function phaseToRole(phaseKey: WorkflowModelPhaseKey): RoleModelRole {
  return phaseKey === "planning" ? "planner" : "builder";
}

type UseModelAutosaveOptions = {
  bootstrap: WorkflowBootstrapPayload;
  onBootstrapFingerprintChange: (fingerprint: string) => void;
  onSelectionChange: (
    role: RoleModelRole,
    input: { modelId: string; params: Array<{ id: string; value: string }> },
  ) => void;
};

export function useModelAutosave({
  bootstrap,
  onBootstrapFingerprintChange,
  onSelectionChange,
}: UseModelAutosaveOptions) {
  const [saveState, setSaveState] = useState<
    Record<WorkflowModelPhaseKey, ModelSaveState>
  >({
    planning: "idle",
    implementation: "idle",
  });
  const timersRef = useRef<
    Partial<Record<WorkflowModelPhaseKey, ReturnType<typeof setTimeout>>>
  >({});
  const fingerprintRef = useRef(bootstrap.configFingerprint);
  const sequenceRef = useRef(0);

  fingerprintRef.current = bootstrap.configFingerprint;

  const scheduleSave = useCallback(
    (
      phaseKey: WorkflowModelPhaseKey,
      selection: { modelId: string; params: Array<{ id: string; value: string }> },
    ) => {
      const existingTimer = timersRef.current[phaseKey];
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      setSaveState((current) => ({ ...current, [phaseKey]: "saving" }));

      timersRef.current[phaseKey] = setTimeout(() => {
        void (async () => {
          const sequenceId = sequenceRef.current + 1;
          sequenceRef.current = sequenceId;
          const role = phaseToRole(phaseKey);
          const expectedConfigFingerprint = fingerprintRef.current;

          try {
            const result = await saveWorkflowModel({
              role,
              modelId: selection.modelId,
              params: selection.params,
              expectedConfigFingerprint,
              sourceMode: bootstrap.sourceMode,
              fixtureId: bootstrap.fixtureId,
              scopeId: bootstrap.selectedScopeId,
              sequenceId,
            });
            if (sequenceId !== sequenceRef.current) {
              return;
            }
            fingerprintRef.current = result.configFingerprint;
            onBootstrapFingerprintChange(result.configFingerprint);
            setSaveState((current) => ({ ...current, [phaseKey]: "saved" }));
          } catch {
            if (sequenceId !== sequenceRef.current) {
              return;
            }
            setSaveState((current) => ({ ...current, [phaseKey]: "error" }));
          }
        })();
      }, AUTOSAVE_DELAY_MS);
    },
    [
      bootstrap.fixtureId,
      bootstrap.selectedScopeId,
      bootstrap.sourceMode,
      onBootstrapFingerprintChange,
    ],
  );

  const handleModelSelect = useCallback(
    (phaseKey: WorkflowModelPhaseKey, modelId: string) => {
      const role = phaseToRole(phaseKey);
      const current =
        role === "planner" ? bootstrap.plannerSelection : bootstrap.builderSelection;
      const model = bootstrap.modelCatalog.find((entry) => entry.id === modelId);
      const defaultParams =
        model?.supportedParameters
          .filter((parameter) => parameter.type === "boolean")
          .map((parameter) => ({
            id: parameter.id,
            value: parameter.defaultValue ?? "false",
          })) ?? [];
      const nextSelection = {
        modelId,
        params: defaultParams,
      };
      onSelectionChange(role, nextSelection);
      scheduleSave(phaseKey, nextSelection);
    },
    [bootstrap, onSelectionChange, scheduleSave],
  );

  const handleModelParameter = useCallback(
    (phaseKey: WorkflowModelPhaseKey, parameterId: string, value: string) => {
      const role = phaseToRole(phaseKey);
      const current =
        role === "planner" ? bootstrap.plannerSelection : bootstrap.builderSelection;
      const params = [
        ...current.parameters.filter((entry) => entry.id !== parameterId),
        { id: parameterId, value },
      ];
      const nextSelection = {
        modelId: current.modelId,
        params,
      };
      onSelectionChange(role, nextSelection);
      scheduleSave(phaseKey, nextSelection);
    },
    [bootstrap, onSelectionChange, scheduleSave],
  );

  const saveStateLabel = (phaseKey: WorkflowModelPhaseKey): string | null => {
    switch (saveState[phaseKey]) {
      case "saving":
        return "Saving…";
      case "saved":
        return "Saved";
      case "error":
        return "Couldn't save";
      default:
        return null;
    }
  };

  return {
    handleModelSelect,
    handleModelParameter,
    saveStateLabel,
  };
}

export function resolveModelDisplayName(
  modelCatalog: WorkflowModelCatalogEntry[],
  modelId: string | undefined,
): string {
  if (!modelId) {
    return "Unknown model";
  }
  return (
    modelCatalog.find((model) => model.id === modelId)?.displayName ?? modelId
  );
}
