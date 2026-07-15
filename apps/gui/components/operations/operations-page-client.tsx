"use client";

import { useCallback, useMemo, useReducer, useState } from "react";
import type { OperationsBootstrapPayload } from "@harness/operations/types";
import { DraftModeBanner } from "./draft-mode-banner";
import { OperationsToolbar } from "./operations-toolbar";
import { OperationsCanvas } from "./operations-canvas";
import { OperationsInspector } from "./operations-inspector";
import { AvailableStatusPanel } from "./available-status-panel";
import { ValidationSummary } from "./validation-summary";
import { EffectiveCurrentState } from "./effective-current-state";
import {
  addStatusToCanvas,
  createInitialOperationsState,
  operationsReducer,
  removeStatusFromCanvas,
  updateRule,
} from "@/lib/operations/reducer";
import {
  resetOperationsDraft,
  saveOperationsDraft,
} from "@/lib/operations/api-client";
import { validateOperationsDraft } from "@harness/operations/validation";

type OperationsPageClientProps = {
  initialBootstrap: OperationsBootstrapPayload;
};

export function OperationsPageClient({
  initialBootstrap,
}: OperationsPageClientProps) {
  const [state, dispatch] = useReducer(
    operationsReducer,
    initialBootstrap,
    createInitialOperationsState,
  );
  const [fitViewSignal, setFitViewSignal] = useState(1);

  const validation = useMemo(
    () =>
      validateOperationsDraft({
        draft: state.draft,
        statuses: state.bootstrap.statuses,
        executors: state.bootstrap.executors,
        modelCatalog: state.bootstrap.modelCatalog,
        currentWorkflowMappings: state.bootstrap.currentWorkflowMappings,
        baseSnapshot: state.draft.baseSnapshot,
      }),
    [state.bootstrap, state.draft],
  );

  const commitDraft = useCallback(
    (draft: typeof state.draft, pushHistory = true) => {
      dispatch({ type: "commit-draft", draft, pushHistory });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    dispatch({ type: "set-save-state", saveState: "saving" });
    try {
      const result = await saveOperationsDraft({
        draft: state.draft,
        sourceMode: state.bootstrap.sourceMode,
        fixtureId: state.bootstrap.fixtureId,
      });
      dispatch({
        type: "set-save-state",
        saveState: "saved",
        saveMessage: result.message,
      });
      dispatch({
        type: "commit-draft",
        draft: result.draft,
        pushHistory: false,
      });
    } catch (error) {
      dispatch({
        type: "set-save-state",
        saveState: "error",
        saveMessage:
          error instanceof Error ? error.message : "Failed to save draft.",
      });
    }
  }, [state.bootstrap.fixtureId, state.bootstrap.sourceMode, state.draft]);

  const handleReset = useCallback(async () => {
    dispatch({ type: "set-save-state", saveState: "saving" });
    try {
      const bootstrap = await resetOperationsDraft({
        sourceMode: state.bootstrap.sourceMode,
        fixtureId: state.bootstrap.fixtureId,
      });
      dispatch({
        type: "replace-bootstrap",
        bootstrap,
        draft: bootstrap.draft!,
      });
      dispatch({
        type: "set-save-state",
        saveState: "clean",
        saveMessage: bootstrap.sourceMode === "fixture"
          ? "Fixture draft reset. Live draft was not modified."
          : "Local Operations draft reset.",
      });
      setFitViewSignal((value) => value + 1);
    } catch (error) {
      dispatch({
        type: "set-save-state",
        saveState: "error",
        saveMessage:
          error instanceof Error ? error.message : "Failed to reset draft.",
      });
    }
  }, [state.bootstrap.fixtureId, state.bootstrap.sourceMode]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4">
      <DraftModeBanner />
      <OperationsToolbar
        dataSourceLabel={state.bootstrap.dataSourceLabel}
        saveState={state.saveState}
        saveMessage={state.saveMessage}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onSave={() => void handleSave()}
        onReset={() => void handleReset()}
        onFitView={() => setFitViewSignal((value) => value + 1)}
      />
      <div className="grid flex-1 gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-[420px] overflow-hidden rounded-md border border-border">
          <OperationsCanvas
            bootstrap={state.bootstrap}
            draft={state.draft}
            onDraftChange={commitDraft}
            onSelect={(selection) => dispatch({ type: "select", selection })}
            fitViewSignal={fitViewSignal}
          />
        </div>
        <div className="space-y-4">
          <OperationsInspector
            bootstrap={state.bootstrap}
            draft={state.draft}
            selection={state.selection}
            onUpdateRule={(ruleId, patch) =>
              commitDraft(updateRule(state.draft, ruleId, patch))
            }
          />
          <AvailableStatusPanel
            statuses={state.bootstrap.statuses}
            onCanvasIds={state.draft.statusIdsOnCanvas}
            onAddStatus={(statusId) =>
              commitDraft(addStatusToCanvas(state.draft, statusId))
            }
            onRemoveStatus={(statusId) =>
              commitDraft(removeStatusFromCanvas(state.draft, statusId))
            }
          />
          <ValidationSummary validation={validation} />
          <EffectiveCurrentState
            currentModel={state.bootstrap.currentModel}
            mappings={state.bootstrap.currentWorkflowMappings}
          />
          {state.bootstrap.warnings.length > 0 ? (
            <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
              {state.bootstrap.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
