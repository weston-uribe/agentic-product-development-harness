"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
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
  addOutcomeToRule,
  createInitialOperationsState,
  deleteOutcome,
  operationsReducer,
  removeStatusFromCanvas,
  updateOutcome,
  updateRule,
  updateRuleModelParameter,
  updateRuleModelSelection,
  updateRuleWithExecutorCleanup,
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
  const [fitViewSignal, setFitViewSignal] = useState(0);
  const isRequestActive = Boolean(state.activeRequest);
  const isDirty = state.saveState === "dirty" || state.saveState === "error";
  const canSave = state.saveState === "dirty" || state.saveState === "error";

  const validation = useMemo(
    () => {
      if (state.unavailableReason) {
        return state.bootstrap.validation;
      }
      return validateOperationsDraft({
        draft: state.draft,
        statuses: state.bootstrap.statuses,
        executors: state.bootstrap.executors,
        modelCatalog: state.bootstrap.modelCatalog,
        currentWorkflowMappings: state.bootstrap.currentWorkflowMappings,
        baseSnapshot: state.draft.baseSnapshot,
      });
    },
    [state.bootstrap, state.draft, state.unavailableReason],
  );

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const commitDraft = useCallback(
    (draft: typeof state.draft, pushHistory = true) => {
      dispatch({ type: "commit-draft", draft, pushHistory });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (state.activeRequest || !canSave || state.unavailableReason) {
      return;
    }
    const token = state.nextRequestToken;
    dispatch({ type: "save-start" });
    try {
      const result = await saveOperationsDraft({
        draft: state.draft,
        sourceMode: state.bootstrap.sourceMode,
        fixtureId: state.bootstrap.fixtureId,
      });
      dispatch({
        type: "save-success",
        token,
        draft: result.draft,
        validation: result.validation,
        message: result.message,
      });
    } catch (error) {
      dispatch({
        type: "save-error",
        token,
        message:
          error instanceof Error ? error.message : "Failed to save draft.",
      });
    }
  }, [
    canSave,
    state.activeRequest,
    state.bootstrap.fixtureId,
    state.bootstrap.sourceMode,
    state.draft,
    state.nextRequestToken,
    state.unavailableReason,
  ]);

  const handleReset = useCallback(async () => {
    if (state.activeRequest || state.unavailableReason) {
      return;
    }
    if (
      isDirty &&
      !window.confirm(
        "Reset the local Operations draft? Unsaved canvas changes will be lost.",
      )
    ) {
      return;
    }
    const token = state.nextRequestToken;
    dispatch({ type: "reset-start" });
    try {
      const bootstrap = await resetOperationsDraft({
        sourceMode: state.bootstrap.sourceMode,
        fixtureId: state.bootstrap.fixtureId,
      });
      dispatch({
        type: "reset-success",
        token,
        bootstrap,
        draft: bootstrap.draft ?? undefined,
        message: bootstrap.sourceMode === "fixture"
          ? "Fixture draft reset. Live draft was not modified."
          : "Local Operations draft reset.",
      });
      setFitViewSignal((value) => value + 1);
    } catch (error) {
      dispatch({
        type: "reset-error",
        token,
        message:
          error instanceof Error ? error.message : "Failed to reset draft.",
      });
    }
  }, [
    isDirty,
    state.activeRequest,
    state.bootstrap.fixtureId,
    state.bootstrap.sourceMode,
    state.nextRequestToken,
    state.unavailableReason,
  ]);

  if (state.unavailableReason) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 px-4 pb-4">
        <DraftModeBanner />
        <OperationsToolbar
          dataSourceLabel={state.bootstrap.dataSourceLabel}
          saveState={state.saveState}
          saveMessage={state.saveMessage}
          canUndo={false}
          canRedo={false}
          canSave={false}
          isRequestActive={isRequestActive}
          onUndo={() => undefined}
          onRedo={() => undefined}
          onSave={() => undefined}
          onReset={() => undefined}
          onFitView={() => undefined}
        />
        <div className="rounded-md border border-destructive/40 bg-card p-4">
          <h2 className="text-base font-semibold">Operations draft unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {state.unavailableReason}
          </p>
        </div>
        <ValidationSummary validation={validation} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4">
      <DraftModeBanner />
      <OperationsToolbar
        dataSourceLabel={state.bootstrap.dataSourceLabel}
        saveState={state.saveState}
        saveMessage={state.saveMessage}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        canSave={canSave}
        isRequestActive={isRequestActive}
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
              commitDraft(
                updateRuleWithExecutorCleanup(
                  state.draft,
                  ruleId,
                  patch,
                  state.bootstrap.executors,
                ),
              )
            }
            onSelectModel={(ruleId, modelId) =>
              commitDraft(
                updateRuleModelSelection(
                  state.draft,
                  ruleId,
                  modelId,
                  state.bootstrap.modelCatalog,
                ),
              )
            }
            onUpdateModelParameter={(ruleId, parameterId, value) =>
              commitDraft(
                updateRuleModelParameter(state.draft, ruleId, parameterId, value),
              )
            }
            onAddOutcome={(ruleId) =>
              commitDraft(addOutcomeToRule(state.draft, ruleId))
            }
            onUpdateOutcome={(ruleId, outcomeId, patch) =>
              commitDraft(updateOutcome(state.draft, ruleId, outcomeId, patch))
            }
            onDeleteOutcome={(ruleId, outcomeId) =>
              commitDraft(deleteOutcome(state.draft, ruleId, outcomeId))
            }
            onRemoveStatus={(statusId) => {
              commitDraft(removeStatusFromCanvas(state.draft, statusId));
              dispatch({ type: "select", selection: { kind: "none" } });
            }}
          />
          <AvailableStatusPanel
            statuses={state.bootstrap.statuses}
            onCanvasIds={state.draft.statusIdsOnCanvas}
            onAddStatus={(statusId) =>
              commitDraft(addStatusToCanvas(state.draft, statusId))
            }
            onRemoveStatus={(statusId) => {
              commitDraft(removeStatusFromCanvas(state.draft, statusId));
              dispatch({ type: "select", selection: { kind: "none" } });
            }}
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
