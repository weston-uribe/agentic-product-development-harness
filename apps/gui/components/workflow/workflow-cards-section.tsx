"use client";

import { useEffect, useState } from "react";
import type { CanonicalStatusKey } from "@harness/workflow/canonical-product-development-workflow";
import { lookupCanonicalStatus } from "@harness/workflow/canonical-product-development-workflow";
import type { PlanReviewReadinessView, WorkflowBootstrapPayload } from "@harness/workflow-page/types";
import { AlertTriangle } from "lucide-react";
import {
  WORKFLOW_OWNERSHIP_COLUMNS,
  optionalPhasesAfterStatus,
  type WorkflowOptionalPhaseDefinition,
} from "@/lib/workflow/workflow-ownership";
import { getViolationForStatus } from "@/lib/workflow/workflow-health";
import { formatWorkflowViolationMessage } from "@/lib/workflow/workflow-violation-messages";
import { resolveStatusContent } from "@/lib/workflow/workflow-status-content";
import {
  resolveModelDisplayName,
  type WorkflowModelPhaseKey,
} from "@/lib/workflow/use-model-autosave";
import { WorkflowModelControl } from "@/components/workflow/workflow-model-control";
import { WorkflowOptionalPhaseBadge } from "@/components/workflow/workflow-optional-phase-badge";
import {
  WorkflowBypassPathDisplay,
  WorkflowCycleLimitControl,
  WorkflowOptionalEnableControl,
  WorkflowSetupRequirementsList,
} from "@/components/workflow/workflow-phase-controls";

const EXPANDED_CARDS_KEY = "workflow-expanded-cards";

type WorkflowCardsSectionProps = {
  bootstrap: WorkflowBootstrapPayload;
  disabled?: boolean;
  planReviewReadiness: PlanReviewReadinessView;
  optionalPhasesSaveLabel?: string | null;
  optionalPhasesSaveError?: string;
  onPlanReviewEnabledChange: (enabled: boolean) => void;
  onPlanReviewCycleLimitChange: (limit: number) => void;
  onSelectModel: (phaseKey: WorkflowModelPhaseKey, modelId: string) => void;
  onUpdateModelParameter: (
    phaseKey: WorkflowModelPhaseKey,
    parameterId: string,
    value: string,
  ) => void;
  saveStateLabel: (phaseKey: WorkflowModelPhaseKey) => string | null;
  saveErrorDetail?: (phaseKey: WorkflowModelPhaseKey) => string | undefined;
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

function optionalBadgeTone(
  readiness: PlanReviewReadinessView,
): "default" | "setup" | "active" {
  if (readiness.uiState === "active") return "active";
  if (readiness.uiState === "setup_required") return "setup";
  return "default";
}

function optionalBadgeLabel(readiness: PlanReviewReadinessView): string {
  if (readiness.uiState === "active") return "Active";
  if (readiness.uiState === "setup_required") return "Setup required";
  return "Optional";
}

export function WorkflowCardsSection({
  bootstrap,
  disabled = false,
  planReviewReadiness,
  optionalPhasesSaveLabel,
  optionalPhasesSaveError,
  onPlanReviewEnabledChange,
  onPlanReviewCycleLimitChange,
  onSelectModel,
  onUpdateModelParameter,
  saveStateLabel,
  saveErrorDetail,
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

  const renderOptionalPhaseCard = (phase: WorkflowOptionalPhaseDefinition) => {
    const statusKey = phase.statusKey;
    const statusDef = lookupCanonicalStatus(statusKey);
    if (!statusDef) {
      return null;
    }
    const isExpanded = expanded.has(statusKey);
    const content = resolveStatusContent(
      statusKey,
      bootstrap.canonicalWorkflow.mergePathVariant,
      planReviewReadiness,
    );
    const showBypass =
      planReviewReadiness.uiState === "disabled" ||
      planReviewReadiness.uiState === "setup_required";

    return (
      <div
        key={`optional-${statusKey}`}
        className="rounded-md border border-dashed border-border"
        data-testid="optional-phase-card"
      >
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left"
          aria-expanded={isExpanded}
          onClick={() => toggleExpanded(statusKey)}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-medium">{statusDef.name}</span>
            <WorkflowOptionalPhaseBadge
              visible
              label={optionalBadgeLabel(planReviewReadiness)}
              tone={optionalBadgeTone(planReviewReadiness)}
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {isExpanded ? "Collapse" : "Expand"}
          </span>
        </button>
        {isExpanded ? (
          <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
            {optionalPhasesSaveLabel ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {optionalPhasesSaveLabel}
              </p>
            ) : null}
            {optionalPhasesSaveError ? (
              <p className="text-xs text-muted-foreground">{optionalPhasesSaveError}</p>
            ) : null}
            <p className="text-muted-foreground">{content.description}</p>
            {content.independentAgentNote ? (
              <p className="text-muted-foreground">{content.independentAgentNote}</p>
            ) : null}
            {content.fields.map((field) => (
              <p key={`${statusKey}-${field.label}`}>
                <span className="font-medium">{field.label}:</span> {field.value}
              </p>
            ))}
            <WorkflowSetupRequirementsList
              visible={planReviewReadiness.uiState === "setup_required"}
              messages={planReviewReadiness.missingRequirementMessages}
            />
            <WorkflowOptionalEnableControl
              visible={content.showOptionalPhaseControls}
              enabled={planReviewReadiness.requestedEnabled}
              label="Enable Plan Review"
              disabled={disabled}
              onChange={onPlanReviewEnabledChange}
            />
            <WorkflowCycleLimitControl
              visible={
                content.showOptionalPhaseControls && planReviewReadiness.requestedEnabled
              }
              cycleName="plan review cycles"
              limit={planReviewReadiness.cycleLimit}
              disabled={disabled}
              onChange={onPlanReviewCycleLimitChange}
            />
            <WorkflowBypassPathDisplay
              visible={showBypass}
              bypassLabel="Planning → Ready for Build"
            />
            {content.showPlanReviewerModel ? (
              <WorkflowModelControl
                label="Plan Reviewer model"
                phaseKey="plan_review"
                disabled={disabled || !planReviewReadiness.requestedEnabled}
                modelCatalog={bootstrap.modelCatalog}
                modelId={bootstrap.planReviewerSelection.modelId}
                parameters={bootstrap.planReviewerSelection.parameters}
                saveLabel={saveStateLabel("plan_review")}
                saveErrorDetail={saveErrorDetail?.("plan_review")}
                onSelectModel={onSelectModel}
                onUpdateModelParameter={onUpdateModelParameter}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderStatusCard = (statusKey: CanonicalStatusKey) => {
    const statusDef = lookupCanonicalStatus(statusKey);
    if (!statusDef) {
      return null;
    }
    const isExpanded = expanded.has(statusKey);
    const violation = getViolationForStatus(
      bootstrap.canonicalWorkflow.violations,
      statusKey,
    );
    const violationMessage = violation
      ? formatWorkflowViolationMessage(violation)
      : null;
    const content = resolveStatusContent(
      statusKey,
      bootstrap.canonicalWorkflow.mergePathVariant,
    );

    return (
      <div key={statusKey}>
        <div
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
              {violationMessage ? (
                <div className="space-y-1 text-destructive">
                  <p>{violationMessage.primary}</p>
                  {violationMessage.body ? <p>{violationMessage.body}</p> : null}
                  {violationMessage.diagnostic?.map((line) => (
                    <p key={line} className="text-xs text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
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
                <WorkflowModelControl
                  label="Planner model"
                  phaseKey="planning"
                  disabled={disabled}
                  modelCatalog={bootstrap.modelCatalog}
                  modelId={bootstrap.plannerSelection.modelId}
                  parameters={bootstrap.plannerSelection.parameters}
                  saveLabel={saveStateLabel("planning")}
                  saveErrorDetail={saveErrorDetail?.("planning")}
                  onSelectModel={onSelectModel}
                  onUpdateModelParameter={onUpdateModelParameter}
                />
              ) : null}
              {content.showBuilderModel ? (
                <WorkflowModelControl
                  label="Builder model"
                  phaseKey="implementation"
                  disabled={disabled}
                  modelCatalog={bootstrap.modelCatalog}
                  modelId={bootstrap.builderSelection.modelId}
                  parameters={bootstrap.builderSelection.parameters}
                  saveLabel={saveStateLabel("implementation")}
                  saveErrorDetail={saveErrorDetail?.("implementation")}
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
        {optionalPhasesAfterStatus(statusKey).map((phase) =>
          phase.alwaysVisible ? renderOptionalPhaseCard(phase) : null,
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
      {WORKFLOW_OWNERSHIP_COLUMNS.map((column) => (
        <section key={column.id} aria-label={column.title} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{column.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{column.description}</p>
          </div>
          <div className="space-y-2">
            {column.statuses.map((statusKey) => renderStatusCard(statusKey))}
          </div>
        </section>
      ))}
    </div>
  );
}
