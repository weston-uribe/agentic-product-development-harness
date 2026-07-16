"use client";

import { useCallback, useReducer, useRef } from "react";
import type { OperationsBootstrapPayload } from "@harness/operations/types";
import { OperationsScopeSelector } from "./operations-scope-selector";
import { WorkflowHealthPanel } from "./workflow-health-panel";
import { WorkflowCardsSection } from "./workflow-cards-section";
import {
  createInitialOperationsState,
  operationsReducer,
} from "@/lib/operations/reducer";
import { fetchOperationsBootstrap } from "@/lib/operations/api-client";
import { useModelAutosave } from "@/lib/operations/use-model-autosave";

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
  const scopeAbortRef = useRef<AbortController | null>(null);
  const scopeLoadTokenRef = useRef(0);

  const isRequestActive = Boolean(state.activeRequest);

  const commitDraft = useCallback((draft: typeof state.draft) => {
    dispatch({ type: "commit-draft", draft, pushHistory: false });
  }, []);

  const { handleModelSelect, handleModelParameter, saveStateLabel } = useModelAutosave({
    draft: state.draft,
    bootstrap: state.bootstrap,
    onDraftChange: commitDraft,
  });

  const handleScopeChange = useCallback(
    async (scopeId: string) => {
      if (scopeId === state.bootstrap.selectedScopeId || state.activeRequest) {
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
        dispatch({
          type: "replace-bootstrap",
          bootstrap,
          draft: bootstrap.draft ?? undefined,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (loadToken !== scopeLoadTokenRef.current) {
          return;
        }
      }
    },
    [
      state.activeRequest,
      state.bootstrap.fixtureId,
      state.bootstrap.selectedScopeId,
      state.bootstrap.sourceMode,
    ],
  );

  if (state.unavailableReason) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflow</h1>
          <p className="text-sm text-muted-foreground">
            Review workflow responsibilities and configure the models used for agent
            work.
          </p>
        </header>
        <div className="rounded-md border border-destructive/40 bg-card p-4">
          <h2 className="text-base font-semibold">Workflow configuration unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">{state.unavailableReason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" aria-busy={isRequestActive}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Workflow</h1>
        <p className="text-sm text-muted-foreground">
          Review workflow responsibilities and configure the models used for agent work.
        </p>
      </header>

      {state.bootstrap.scopes.length > 0 ? (
        <OperationsScopeSelector
          scopes={state.bootstrap.scopes}
          selectedScopeId={state.bootstrap.selectedScopeId}
          disabled={isRequestActive}
          onScopeChange={(scopeId) => void handleScopeChange(scopeId)}
        />
      ) : null}

      <WorkflowHealthPanel bootstrap={state.bootstrap} />

      <WorkflowCardsSection
        bootstrap={state.bootstrap}
        draft={state.draft}
        disabled={isRequestActive}
        onSelectModel={handleModelSelect}
        onUpdateModelParameter={handleModelParameter}
        saveStateLabel={saveStateLabel}
      />
    </div>
  );
}
