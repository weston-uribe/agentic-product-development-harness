"use client";

import { useCallback, useRef, useState } from "react";
import type { RoleModelRole } from "@harness/config/role-models";
import type { WorkflowBootstrapPayload, WorkflowModelSelection } from "@harness/workflow-page/types";
import { WorkflowScopeSelector } from "@/components/workflow/workflow-scope-selector";
import { WorkflowHealthPanel } from "@/components/workflow/workflow-health-panel";
import { WorkflowCardsSection } from "@/components/workflow/workflow-cards-section";
import { fetchWorkflowBootstrap } from "@/lib/workflow/api-client";
import { useModelAutosave } from "@/lib/workflow/use-model-autosave";

type WorkflowPageClientProps = {
  initialBootstrap: WorkflowBootstrapPayload;
};

function toCommittedSelections(
  bootstrap: WorkflowBootstrapPayload,
): Record<RoleModelRole, WorkflowModelSelection> {
  return {
    planner: bootstrap.plannerSelection,
    builder: bootstrap.builderSelection,
  };
}

export function WorkflowPageClient({ initialBootstrap }: WorkflowPageClientProps) {
  const [bootstrap, setBootstrap] = useState(initialBootstrap);
  const [committedSelections, setCommittedSelections] = useState(() =>
    toCommittedSelections(initialBootstrap),
  );
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const scopeAbortRef = useRef<AbortController | null>(null);
  const scopeLoadTokenRef = useRef(0);

  const unavailableReason =
    bootstrap.selectedScopeId === undefined && bootstrap.scopes.length > 0
      ? "Workflow scope is required."
      : null;

  const handleBootstrapFingerprintChange = useCallback((fingerprint: string) => {
    setBootstrap((current) => ({ ...current, configFingerprint: fingerprint }));
  }, []);

  const handleCommittedSelectionsChange = useCallback(
    (role: RoleModelRole, selection: WorkflowModelSelection) => {
      setCommittedSelections((current) => ({ ...current, [role]: selection }));
    },
    [],
  );

  const {
    plannerSelection,
    builderSelection,
    handleModelSelect,
    handleModelParameter,
    saveStateLabel,
    saveErrorDetail,
  } = useModelAutosave({
    bootstrap,
    committedSelections,
    onCommittedSelectionsChange: handleCommittedSelectionsChange,
    onBootstrapFingerprintChange: handleBootstrapFingerprintChange,
  });

  const handleScopeChange = useCallback(
    async (scopeId: string) => {
      if (scopeId === bootstrap.selectedScopeId || isLoadingScope) {
        return;
      }

      scopeAbortRef.current?.abort();
      const controller = new AbortController();
      scopeAbortRef.current = controller;
      const loadToken = scopeLoadTokenRef.current + 1;
      scopeLoadTokenRef.current = loadToken;
      setIsLoadingScope(true);

      try {
        const nextBootstrap = await fetchWorkflowBootstrap({
          sourceMode: bootstrap.sourceMode,
          fixtureId: bootstrap.fixtureId,
          scopeId,
          signal: controller.signal,
        });
        if (loadToken !== scopeLoadTokenRef.current) {
          return;
        }
        setBootstrap(nextBootstrap);
        setCommittedSelections(toCommittedSelections(nextBootstrap));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      } finally {
        if (loadToken === scopeLoadTokenRef.current) {
          setIsLoadingScope(false);
        }
      }
    },
    [
      bootstrap.fixtureId,
      bootstrap.selectedScopeId,
      bootstrap.sourceMode,
      isLoadingScope,
    ],
  );

  if (unavailableReason) {
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
          <p className="mt-2 text-sm text-muted-foreground">{unavailableReason}</p>
        </div>
      </div>
    );
  }

  const viewBootstrap: WorkflowBootstrapPayload = {
    ...bootstrap,
    plannerSelection,
    builderSelection,
  };

  return (
    <div className="space-y-8" aria-busy={isLoadingScope}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Workflow</h1>
        <p className="text-sm text-muted-foreground">
          Review workflow responsibilities and configure the models used for agent work.
        </p>
      </header>

      {bootstrap.scopes.length > 0 ? (
        <WorkflowScopeSelector
          scopes={bootstrap.scopes}
          selectedScopeId={bootstrap.selectedScopeId}
          disabled={isLoadingScope}
          onScopeChange={(scopeId) => void handleScopeChange(scopeId)}
        />
      ) : null}

      <WorkflowHealthPanel bootstrap={viewBootstrap} />

      <WorkflowCardsSection
        bootstrap={viewBootstrap}
        disabled={isLoadingScope}
        onSelectModel={handleModelSelect}
        onUpdateModelParameter={handleModelParameter}
        saveStateLabel={saveStateLabel}
        saveErrorDetail={saveErrorDetail}
      />
    </div>
  );
}
