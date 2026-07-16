"use client";

import { useCallback, useRef, useState } from "react";
import type { CanonicalAgentPhaseKey } from "@harness/workflow/canonical-product-development-workflow";
import type {
  OperationsBootstrapPayload,
  OperationsModelCatalogEntry,
  OperationsWorkflowDraft,
} from "@harness/operations/types";
import { saveOperationsDraft } from "@/lib/operations/api-client";
import {
  updatePhaseModelParameter,
  updatePhaseModelSelection,
} from "@/lib/operations/reducer";

export type PrototypeModelPhaseKey = "planning" | "implementation";

export type ModelSaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 400;

export function stripToPrototypeModelKeys(
  draft: OperationsWorkflowDraft,
): OperationsWorkflowDraft {
  const { planning, implementation } = draft.phaseModelSettings;
  return {
    ...draft,
    phaseModelSettings: {
      ...(planning ? { planning } : {}),
      ...(implementation ? { implementation } : {}),
    },
  };
}

type UseModelAutosaveOptions = {
  draft: OperationsWorkflowDraft;
  bootstrap: OperationsBootstrapPayload;
  onDraftChange: (draft: OperationsWorkflowDraft) => void;
};

export function useModelAutosave({
  draft,
  bootstrap,
  onDraftChange,
}: UseModelAutosaveOptions) {
  const [saveState, setSaveState] = useState<
    Record<PrototypeModelPhaseKey, ModelSaveState>
  >({
    planning: "idle",
    implementation: "idle",
  });
  const timersRef = useRef<
    Partial<Record<PrototypeModelPhaseKey, ReturnType<typeof setTimeout>>>
  >({});

  const scheduleSave = useCallback(
    (phaseKey: PrototypeModelPhaseKey, nextDraft: OperationsWorkflowDraft) => {
      const existingTimer = timersRef.current[phaseKey];
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      setSaveState((current) => ({ ...current, [phaseKey]: "saving" }));

      timersRef.current[phaseKey] = setTimeout(() => {
        void (async () => {
          try {
            const persistedDraft = stripToPrototypeModelKeys(nextDraft);
            await saveOperationsDraft({
              draft: persistedDraft,
              sourceMode: bootstrap.sourceMode,
              fixtureId: bootstrap.fixtureId,
              scopeId: bootstrap.selectedScopeId,
            });
            setSaveState((current) => ({ ...current, [phaseKey]: "saved" }));
          } catch {
            setSaveState((current) => ({ ...current, [phaseKey]: "error" }));
          }
        })();
      }, AUTOSAVE_DELAY_MS);
    },
    [bootstrap.fixtureId, bootstrap.selectedScopeId, bootstrap.sourceMode],
  );

  const handleModelSelect = useCallback(
    (phaseKey: PrototypeModelPhaseKey, modelId: string) => {
      const agentPhaseKey = phaseKey as CanonicalAgentPhaseKey;
      const nextDraft = updatePhaseModelSelection(
        draft,
        agentPhaseKey,
        modelId,
        bootstrap.modelCatalog,
      );
      onDraftChange(nextDraft);
      scheduleSave(phaseKey, nextDraft);
    },
    [bootstrap.modelCatalog, draft, onDraftChange, scheduleSave],
  );

  const handleModelParameter = useCallback(
    (phaseKey: PrototypeModelPhaseKey, parameterId: string, value: string) => {
      const agentPhaseKey = phaseKey as CanonicalAgentPhaseKey;
      const nextDraft = updatePhaseModelParameter(
        draft,
        agentPhaseKey,
        parameterId,
        value,
      );
      onDraftChange(nextDraft);
      scheduleSave(phaseKey, nextDraft);
    },
    [draft, onDraftChange, scheduleSave],
  );

  const saveStateLabel = (phaseKey: PrototypeModelPhaseKey): string | null => {
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
  modelCatalog: OperationsModelCatalogEntry[],
  modelId: string | undefined,
): string {
  if (!modelId) {
    return "Global default";
  }
  return (
    modelCatalog.find((model) => model.id === modelId)?.displayName ?? modelId
  );
}
