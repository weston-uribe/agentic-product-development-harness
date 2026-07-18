"use client";

import { useCallback, useRef, useState } from "react";
import type { RoleModelRole } from "@harness/config/role-models";
import type {
  PlanReviewReadinessView,
  WorkflowBootstrapPayload,
  WorkflowModelSelection,
} from "@harness/workflow-page/types";
import { WorkflowScopeSelector } from "@/components/workflow/workflow-scope-selector";
import { WorkflowHealthPanel } from "@/components/workflow/workflow-health-panel";
import { WorkflowCardsSection } from "@/components/workflow/workflow-cards-section";
import { fetchWorkflowBootstrap } from "@/lib/workflow/api-client";
import { useModelAutosave } from "@/lib/workflow/use-model-autosave";
import { useWorkflowOptionalPhasesSave } from "@/lib/workflow/use-workflow-optional-phases-save";

type WorkflowPageClientProps = {
  initialBootstrap: WorkflowBootstrapPayload;
};

function toCommittedSelections(
  bootstrap: WorkflowBootstrapPayload,
): Record<RoleModelRole, WorkflowModelSelection> {
  return {
    planner: bootstrap.plannerSelection,
    builder: bootstrap.builderSelection,
    planReviewer: bootstrap.planReviewerSelection,
  };
}

export function WorkflowPageClient({ initialBootstrap }: WorkflowPageClientProps) {
  const [bootstrap, setBootstrap] = useState(initialBootstrap);
  const [committedSelections, setCommittedSelections] = useState(() =>
    toCommittedSelections(initialBootstrap),
  );
  const [committedPlanReviewReadiness, setCommittedPlanReviewReadiness] = useState(
    initialBootstrap.planReviewReadiness,
  );
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const scopeAbortRef = useRef<AbortController | null>(null);
  const scopeLoadTokenRef = useRef(0);
  const syncOptionalReadinessRef = useRef<(readiness: PlanReviewReadinessView) => void>(
    () => {},
  );

  const unavailableReason =
    bootstrap.selectedScopeId === undefined && bootstrap.scopes.length > 0
      ? "Workflow scope is required."
      : null;

  const handleBootstrapFingerprintChange = useCallback((fingerprint: string) => {
    setBootstrap((current) => ({ ...current, configFingerprint: fingerprint }));
  }, []);

  const reloadBootstrap = useCallback(async () => {
    const nextBootstrap = await fetchWorkflowBootstrap({
      sourceMode: bootstrap.sourceMode,
      fixtureId: bootstrap.fixtureId,
      scopeId: bootstrap.selectedScopeId,
    });
    setBootstrap(nextBootstrap);
    setCommittedPlanReviewReadiness(nextBootstrap.planReviewReadiness);
    syncOptionalReadinessRef.current(nextBootstrap.planReviewReadiness);
    return nextBootstrap;
  }, [bootstrap.fixtureId, bootstrap.selectedScopeId, bootstrap.sourceMode]);

  const handleCommittedSelectionsChange = useCallback(
    (role: RoleModelRole, selection: WorkflowModelSelection) => {
      setCommittedSelections((current) => ({ ...current, [role]: selection }));
    },
    [],
  );

  const handleCommittedPlanReviewReadinessChange = useCallback(
    (_readiness: PlanReviewReadinessView) => {
      void reloadBootstrap();
    },
    [reloadBootstrap],
  );

  const {
    plannerSelection,
    builderSelection,
    planReviewerSelection,
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

  const optionalPhasesSave = useWorkflowOptionalPhasesSave({
    context: {
      sourceMode: bootstrap.sourceMode,
      fixtureId: bootstrap.fixtureId,
      selectedScopeId: bootstrap.selectedScopeId,
      configFingerprint: bootstrap.configFingerprint,
    },
    committedReadiness: committedPlanReviewReadiness,
    onCommittedReadinessChange: handleCommittedPlanReviewReadinessChange,
    onFingerprintChange: handleBootstrapFingerprintChange,
  });

  syncOptionalReadinessRef.current = optionalPhasesSave.syncCommittedReadiness;

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
        setCommittedPlanReviewReadiness(nextBootstrap.planReviewReadiness);
        optionalPhasesSave.syncCommittedReadiness(nextBootstrap.planReviewReadiness);
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
      optionalPhasesSave,
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
    planReviewerSelection,
    planReviewReadiness: optionalPhasesSave.planReviewReadiness,
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
        planReviewReadiness={optionalPhasesSave.planReviewReadiness}
        optionalPhasesSaveLabel={optionalPhasesSave.saveStateLabel}
        optionalPhasesSaveError={optionalPhasesSave.saveError}
        onPlanReviewEnabledChange={optionalPhasesSave.handlePlanReviewEnabledChange}
        onPlanReviewCycleLimitChange={optionalPhasesSave.handlePlanReviewCycleLimitChange}
        onSelectModel={handleModelSelect}
        onUpdateModelParameter={handleModelParameter}
        saveStateLabel={saveStateLabel}
        saveErrorDetail={saveErrorDetail}
      />
    </div>
  );
}
