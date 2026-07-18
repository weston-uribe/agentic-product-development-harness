"use client";

import type { WorkflowBootstrapPayload } from "@harness/workflow-page/types";
import { GuidedSelect } from "@/components/ui/guided-select";
import type { WorkflowModelPhaseKey } from "@/lib/workflow/use-model-autosave";

export type WorkflowModelControlProps = {
  label: string;
  phaseKey: WorkflowModelPhaseKey;
  disabled?: boolean;
  modelCatalog: WorkflowBootstrapPayload["modelCatalog"];
  modelId: string;
  parameters: Array<{ id: string; value: string }>;
  saveLabel: string | null;
  saveErrorDetail?: string;
  onSelectModel: (phaseKey: WorkflowModelPhaseKey, modelId: string) => void;
  onUpdateModelParameter: (
    phaseKey: WorkflowModelPhaseKey,
    parameterId: string,
    value: string,
  ) => void;
  onRetry?: (phaseKey: WorkflowModelPhaseKey) => void;
};

export function WorkflowModelControl({
  label,
  phaseKey,
  disabled = false,
  modelCatalog,
  modelId,
  parameters,
  saveLabel,
  saveErrorDetail,
  onSelectModel,
  onUpdateModelParameter,
  onRetry,
}: WorkflowModelControlProps) {
  const selectedModel = modelCatalog.find((model) => model.id === modelId);
  const showRetry = saveLabel?.startsWith("Couldn't save") && onRetry;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {saveLabel ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saveLabel}
          </span>
        ) : null}
      </div>
      {saveErrorDetail ? (
        <p className="text-xs text-muted-foreground">{saveErrorDetail}</p>
      ) : null}
      {showRetry ? (
        <button
          type="button"
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => onRetry(phaseKey)}
        >
          Retry
        </button>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Model</span>
        <GuidedSelect
          disabled={disabled}
          value={modelId}
          onChange={(event) => onSelectModel(phaseKey, event.target.value)}
        >
          {modelCatalog
            .filter((model) => model.availability === "available")
            .map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
        </GuidedSelect>
      </label>
      {selectedModel
        ? selectedModel.supportedParameters
            .filter((parameter) => parameter.type === "boolean")
            .map((parameter) => {
              const current = parameters.find((entry) => entry.id === parameter.id)?.value;
              const checked = current === "true";
              return (
                <label
                  key={parameter.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{parameter.label}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={parameter.label}
                    disabled={disabled || !modelId}
                    checked={checked}
                    onChange={(event) =>
                      onUpdateModelParameter(
                        phaseKey,
                        parameter.id,
                        event.target.checked ? "true" : "false",
                      )
                    }
                  />
                </label>
              );
            })
        : null}
    </div>
  );
}
