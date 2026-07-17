"use client";

import { useEffect, useState } from "react";
import type { CanonicalStatusKey } from "@harness/workflow/canonical-product-development-workflow";
import { lookupCanonicalStatus } from "@harness/workflow/canonical-product-development-workflow";
import type { WorkflowBootstrapPayload } from "@harness/workflow-page/types";
import { AlertTriangle } from "lucide-react";
import { WORKFLOW_OWNERSHIP_COLUMNS } from "@/lib/workflow/workflow-ownership";
import { getViolationForStatus } from "@/lib/workflow/workflow-health";
import { resolveStatusContent } from "@/lib/workflow/workflow-status-content";
import {
  resolveModelDisplayName,
  type WorkflowModelPhaseKey,
} from "@/lib/workflow/use-model-autosave";

const EXPANDED_CARDS_KEY = "workflow-expanded-cards";

type WorkflowCardsSectionProps = {
  bootstrap: WorkflowBootstrapPayload;
  disabled?: boolean;
  onSelectModel: (phaseKey: WorkflowModelPhaseKey, modelId: string) => void;
  onUpdateModelParameter: (
    phaseKey: WorkflowModelPhaseKey,
    parameterId: string,
    value: string,
  ) => void;
  saveStateLabel: (phaseKey: WorkflowModelPhaseKey) => string | null;
};

function readExpandedCards(): Set<CanonicalStatusKey> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.sessionStorage.getItem(EXPANDED_CARDS_KEY);
    if (!raw) {
      return new Set();
    }
    return new Set(JSON.parse(raw) as CanonicalStatusKey[]);
  } catch {
    return new Set();
  }
}

function writeExpandedCards(keys: Set<CanonicalStatusKey>): void {
  window.sessionStorage.setItem(EXPANDED_CARDS_KEY, JSON.stringify([...keys]));
}

export function WorkflowCardsSection({
  bootstrap,
  disabled = false,
  onSelectModel,
  onUpdateModelParameter,
  saveStateLabel,
}: WorkflowCardsSectionProps) {
  const [expanded, setExpanded] = useState<Set<CanonicalStatusKey>>(() =>
    readExpandedCards(),
  );

  useEffect(() => {
    writeExpandedCards(expanded);
  }, [expanded]);

  const toggleExpanded = (key: CanonicalStatusKey) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const builderDisplayName = resolveModelDisplayName(
    bootstrap.modelCatalog,
    bootstrap.builderSelection.modelId,
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
      {WORKFLOW_OWNERSHIP_COLUMNS.map((column) => (
        <section key={column.id} aria-label={column.title} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{column.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{column.description}</p>
          </div>
          <div className="space-y-2">
            {column.statuses.map((statusKey) => {
              const statusDef = lookupCanonicalStatus(statusKey);
              if (!statusDef) {
                return null;
              }
              const isExpanded = expanded.has(statusKey);
              const violation = getViolationForStatus(
                bootstrap.canonicalWorkflow.violations,
                statusKey,
              );
              const content = resolveStatusContent(
                statusKey,
                bootstrap.canonicalWorkflow.mergePathVariant,
              );

              return (
                <div
                  key={statusKey}
                  className={`rounded-md border ${
                    violation ? "border-destructive/50" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpanded(statusKey)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm font-medium">{statusDef.name}</span>
                      {violation ? (
                        <AlertTriangle
                          className="size-4 shrink-0 text-destructive"
                          aria-label="Needs attention"
                        />
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {isExpanded ? "Collapse" : "Expand"}
                    </span>
                  </button>
                  {isExpanded ? (
                    <div className="space-y-2 border-t border-border px-3 py-3 text-sm">
                      {violation ? (
                        <p className="text-destructive">{violation.message}</p>
                      ) : null}
                      <p className="text-muted-foreground">{content.description}</p>
                      {content.fields.map((field) => (
                        <p key={`${statusKey}-${field.label}`}>
                          <span className="font-medium">{field.label}:</span> {field.value}
                        </p>
                      ))}
                      {content.builderModelNote ? (
                        <p className="text-muted-foreground">{content.builderModelNote}</p>
                      ) : null}
                      {content.showPlannerModel ? (
                        <ModelControl
                          label="Planner model"
                          phaseKey="planning"
                          disabled={disabled}
                          modelCatalog={bootstrap.modelCatalog}
                          modelId={bootstrap.plannerSelection.modelId}
                          parameters={bootstrap.plannerSelection.parameters}
                          saveLabel={saveStateLabel("planning")}
                          onSelectModel={onSelectModel}
                          onUpdateModelParameter={onUpdateModelParameter}
                        />
                      ) : null}
                      {content.showBuilderModel ? (
                        <ModelControl
                          label="Builder model"
                          phaseKey="implementation"
                          disabled={disabled}
                          modelCatalog={bootstrap.modelCatalog}
                          modelId={bootstrap.builderSelection.modelId}
                          parameters={bootstrap.builderSelection.parameters}
                          saveLabel={saveStateLabel("implementation")}
                          onSelectModel={onSelectModel}
                          onUpdateModelParameter={onUpdateModelParameter}
                        />
                      ) : null}
                      {content.showBuilderModelReference ? (
                        <p>
                          <span className="font-medium">Uses Builder model:</span>{" "}
                          {builderDisplayName}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

type ModelControlProps = {
  label: string;
  phaseKey: WorkflowModelPhaseKey;
  disabled: boolean;
  modelCatalog: WorkflowBootstrapPayload["modelCatalog"];
  modelId: string;
  parameters: Array<{ id: string; value: string }>;
  saveLabel: string | null;
  onSelectModel: (phaseKey: WorkflowModelPhaseKey, modelId: string) => void;
  onUpdateModelParameter: (
    phaseKey: WorkflowModelPhaseKey,
    parameterId: string,
    value: string,
  ) => void;
};

function ModelControl({
  label,
  phaseKey,
  disabled,
  modelCatalog,
  modelId,
  parameters,
  saveLabel,
  onSelectModel,
  onUpdateModelParameter,
}: ModelControlProps) {
  const selectedModel = modelCatalog.find((model) => model.id === modelId);

  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {saveLabel ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saveLabel}
          </span>
        ) : null}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Model</span>
        <select
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
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
        </select>
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
