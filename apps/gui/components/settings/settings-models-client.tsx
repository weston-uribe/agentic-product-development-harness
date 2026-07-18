"use client";

import { useCallback, useState } from "react";
import type { RoleModelRole } from "@harness/config/role-models";
import type { WorkflowBootstrapPayload, WorkflowModelSelection } from "@harness/workflow-page/types";
import { WorkflowModelControl } from "@/components/workflow/workflow-model-control";
import { useModelAutosave } from "@/lib/workflow/use-model-autosave";

type SettingsModelsClientProps = {
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

export function SettingsModelsClient({ initialBootstrap }: SettingsModelsClientProps) {
  const [bootstrap, setBootstrap] = useState(initialBootstrap);
  const [committedSelections, setCommittedSelections] = useState(() =>
    toCommittedSelections(initialBootstrap),
  );

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
    retrySave,
    saveStateLabel,
    saveErrorDetail,
  } = useModelAutosave({
    bootstrap,
    committedSelections,
    onCommittedSelectionsChange: handleCommittedSelectionsChange,
    onBootstrapFingerprintChange: handleBootstrapFingerprintChange,
  });

  const catalogUnavailable =
    bootstrap.catalogLoadMetadata.modelCatalog !== "loaded" ||
    bootstrap.modelCatalog.every((entry) => entry.availability !== "available");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Models</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Planner and Builder models share the same configuration as the Workflow page.
        </p>
      </div>
      {catalogUnavailable ? (
        <p className="text-sm text-muted-foreground">
          Live Cursor model catalog is unavailable. Confirm CURSOR_API_KEY is configured, then
          reload this page.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <WorkflowModelControl
          label="Planner model"
          phaseKey="planning"
          disabled={catalogUnavailable}
          modelCatalog={bootstrap.modelCatalog}
          modelId={plannerSelection.modelId}
          parameters={plannerSelection.parameters}
          configurationSurface="settings"
          saveLabel={saveStateLabel("planning")}
          saveErrorDetail={saveErrorDetail("planning")}
          onSelectModel={handleModelSelect}
          onUpdateModelParameter={handleModelParameter}
          onRetry={retrySave}
        />
        <WorkflowModelControl
          label="Builder model"
          phaseKey="implementation"
          disabled={catalogUnavailable}
          modelCatalog={bootstrap.modelCatalog}
          modelId={builderSelection.modelId}
          parameters={builderSelection.parameters}
          configurationSurface="settings"
          saveLabel={saveStateLabel("implementation")}
          saveErrorDetail={saveErrorDetail("implementation")}
          onSelectModel={handleModelSelect}
          onUpdateModelParameter={handleModelParameter}
          onRetry={retrySave}
        />
      </div>
    </div>
  );
}
