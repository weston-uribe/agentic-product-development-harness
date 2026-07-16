"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CanonicalStatusKey } from "@harness/workflow/canonical-product-development-workflow";
import type { OperationsBootstrapPayload, OperationsValidationIssue } from "@harness/operations/types";
import { DraftModeBanner } from "./draft-mode-banner";
import { OperationsToolbar } from "./operations-toolbar";
import { OperationsCanvas } from "./operations-canvas";
import { OperationsSidebar } from "./operations-sidebar";
import { OperationsIssuesPanel } from "./operations-issues-panel";
import {
  createInitialOperationsState,
  isDraftDirty,
  operationsReducer,
  updatePhaseModelParameter,
  updatePhaseModelSelection,
} from "@/lib/operations/reducer";
import {
  fetchOperationsBootstrap,
  resetOperationsDraft,
  saveOperationsDraft,
} from "@/lib/operations/api-client";
import { validateOperationsDraft } from "@harness/operations/validation";

const SIDEBAR_COLLAPSED_KEY = "operations-sidebar-collapsed";

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
  const [scrollToCardSignal, setScrollToCardSignal] = useState<CanonicalStatusKey | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.sessionStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const scopeAbortRef = useRef<AbortController | null>(null);
  const scopeLoadTokenRef = useRef(0);

  const isRequestActive = Boolean(state.activeRequest);
  const isDirty = isDraftDirty(state.draft, state.cleanFingerprint);
  const canSave = isDirty && !isRequestActive;

  const validation = useMemo(
    () => {
      if (state.unavailableReason) {
        return state.bootstrap.validation;
      }
      return validateOperationsDraft({
        draft: state.draft,
        statuses: state.bootstrap.statuses,
        modelCatalog: state.bootstrap.modelCatalog,
        currentWorkflowMappings: state.bootstrap.currentWorkflowMappings,
        baseSnapshot: state.draft.baseSnapshot,
        catalogLoadMetadata: state.bootstrap.catalogLoadMetadata,
        config: undefined,
        canonicalValidation: {
          valid: state.bootstrap.canonicalWorkflow.healthState === "healthy",
          violations: state.bootstrap.canonicalWorkflow.violations,
          informationalWarnings: state.bootstrap.canonicalWorkflow.informationalWarnings,
          resolvedStatuses: {},
        },
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

  useEffect(() => {
    window.sessionStorage.setItem(
      SIDEBAR_COLLAPSED_KEY,
      sidebarCollapsed ? "1" : "0",
    );
  }, [sidebarCollapsed]);

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
        scopeId: state.bootstrap.selectedScopeId,
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
    state.bootstrap.selectedScopeId,
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
        scopeId: state.bootstrap.selectedScopeId,
      });
      dispatch({
        type: "reset-success",
        token,
        bootstrap,
        draft: bootstrap.draft ?? undefined,
        message: "Draft reset.",
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
    state.bootstrap.selectedScopeId,
    state.bootstrap.sourceMode,
    state.nextRequestToken,
    state.unavailableReason,
  ]);

  const handleScopeChange = useCallback(
    async (scopeId: string) => {
      if (scopeId === state.bootstrap.selectedScopeId || state.activeRequest) {
        return;
      }
      if (
        isDirty &&
        !window.confirm(
          "Switch workflow scope? Unsaved changes to the current draft will be lost unless you save first.",
        )
      ) {
        return;
      }

      scopeAbortRef.current?.abort();
      const controller = new AbortController();
      scopeAbortRef.current = controller;
      const loadToken = scopeLoadTokenRef.current + 1;
      scopeLoadTokenRef.current = loadToken;

      try {
        const bootstrap = await fetchOperationsBootstrap({
          sourceMode: state.bootstrap.sourceMode,
          fixtureId: state.bootstrap.fixtureId,
          scopeId,
          signal: controller.signal,
        });
        if (loadToken !== scopeLoadTokenRef.current) {
          return;
        }
        dispatch({ type: "replace-bootstrap", bootstrap, draft: bootstrap.draft ?? undefined });
        setFitViewSignal((value) => value + 1);
        setMobileSidebarOpen(false);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (loadToken !== scopeLoadTokenRef.current) {
          return;
        }
        dispatch({
          type: "set-request-state",
          requestState: "error",
          saveMessage:
            error instanceof Error ? error.message : "Failed to switch scope.",
        });
      }
    },
    [
      isDirty,
      state.activeRequest,
      state.bootstrap.fixtureId,
      state.bootstrap.selectedScopeId,
      state.bootstrap.sourceMode,
    ],
  );

  const handleIssueClick = useCallback((issue: OperationsValidationIssue) => {
    if (issue.canonicalStatusKey) {
      dispatch({
        type: "select",
        selection: { kind: "status", canonicalStatusKey: issue.canonicalStatusKey },
      });
      setScrollToCardSignal(issue.canonicalStatusKey);
    }
  }, []);

  const handleSelectStatus = useCallback((canonicalStatusKey: CanonicalStatusKey) => {
    dispatch({
      type: "select",
      selection: { kind: "status", canonicalStatusKey },
    });
    setScrollToCardSignal(canonicalStatusKey);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileSidebarOpen((open) => !open);
      return;
    }
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  if (state.unavailableReason) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <h1 className="shrink-0 px-4 pt-3 text-lg font-semibold">Operations</h1>
        <DraftModeBanner />
        <OperationsToolbar
          requestState={state.requestState}
          isDirty={false}
          saveMessage={state.saveMessage}
          canUndo={false}
          canRedo={false}
          canSave={false}
          isRequestActive={isRequestActive}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          onUndo={() => undefined}
          onRedo={() => undefined}
          onSave={() => undefined}
          onReset={() => undefined}
          onFitView={() => undefined}
        />
        <div className="overflow-y-auto p-4">
          <div className="rounded-md border border-destructive/40 bg-card p-4">
            <h2 className="text-base font-semibold">Operations draft unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {state.unavailableReason}
            </p>
          </div>
          <div className="mt-4">
            <OperationsIssuesPanel validation={validation} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-busy={isRequestActive}
    >
      <h1 className="shrink-0 px-4 pt-3 text-lg font-semibold">Operations</h1>
      <DraftModeBanner />
      <OperationsToolbar
        requestState={state.requestState}
        isDirty={isDirty}
        saveMessage={state.saveMessage}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        canSave={canSave}
        isRequestActive={isRequestActive}
        sidebarCollapsed={sidebarCollapsed && !mobileSidebarOpen}
        onToggleSidebar={toggleSidebar}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onSave={() => void handleSave()}
        onReset={() => void handleReset()}
        onFitView={() => setFitViewSignal((value) => value + 1)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <OperationsSidebar
          bootstrap={state.bootstrap}
          draft={state.draft}
          selection={state.selection}
          validation={validation}
          disabled={isRequestActive}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          scrollToCardSignal={scrollToCardSignal}
          onScopeChange={(scopeId) => void handleScopeChange(scopeId)}
          onIssueClick={handleIssueClick}
          onSelectStatus={handleSelectStatus}
          onSelectModel={(phaseKey, modelId) =>
            commitDraft(
              updatePhaseModelSelection(
                state.draft,
                phaseKey,
                modelId,
                state.bootstrap.modelCatalog,
              ),
            )
          }
          onUpdateModelParameter={(phaseKey, parameterId, value) =>
            commitDraft(
              updatePhaseModelParameter(state.draft, phaseKey, parameterId, value),
            )
          }
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <OperationsCanvas
            bootstrap={state.bootstrap}
            draft={state.draft}
            selection={state.selection}
            onDraftChange={commitDraft}
            onSelect={(selection) => {
              dispatch({ type: "select", selection });
              if (selection.kind === "status") {
                setScrollToCardSignal(selection.canonicalStatusKey);
              }
            }}
            fitViewSignal={fitViewSignal}
            isRequestActive={isRequestActive}
          />
        </div>
      </div>
    </div>
  );
}
