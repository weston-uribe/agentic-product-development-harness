import type {
  OperationsBaseSnapshot,
  OperationsCurrentWorkflowMapping,
  OperationsDraftModelSelection,
  OperationsLayout,
  OperationsModelCatalogEntry,
  OperationsNestedRecoveryPolicy,
  OperationsOutcome,
  OperationsRule,
  OperationsSourceContext,
  OperationsWorkflowDraft,
} from "../types.js";
import { OPERATIONS_DRAFT_SCHEMA_VERSION } from "../constants.js";

export const FIXTURE_DRAFT_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/** Stable fixture status ids from basic-current-workflow. */
export const FIXTURE_STATUS_IDS = {
  readyPlanning: "status-ready-planning",
  readyBuild: "status-ready-build",
  prOpen: "status-pr-open",
  pmReview: "status-pm-review",
  engReview: "status-eng-review",
  needsRevision: "status-needs-revision",
  readyMerge: "status-ready-merge",
  blocked: "status-blocked",
  mergedDev: "status-merged-dev",
} as const;

export function resolveStatusId(
  mappings: OperationsCurrentWorkflowMapping[],
  mappingKey: string,
  fallbackId?: string,
): string | undefined {
  const mapping = mappings.find((entry) => entry.mappingKey === mappingKey);
  if (mapping?.resolvedStatusIds.length === 1) {
    return mapping.resolvedStatusIds[0];
  }
  return fallbackId;
}

export function buildCursorModelSelection(
  modelCatalog: OperationsModelCatalogEntry[],
  modelId: string,
  parameterOverrides?: Record<string, string>,
): OperationsDraftModelSelection | undefined {
  const model = modelCatalog.find((entry) => entry.id === modelId);
  if (!model || model.availability !== "available") {
    return undefined;
  }
  const parameters = model.supportedParameters.map((parameter) => ({
    id: parameter.id,
    value:
      parameterOverrides?.[parameter.id] ??
      (parameter.id === "fast" ? "false" : parameter.defaultValue ?? ""),
  }));
  return {
    modelId: model.id,
    displayNameAtSelection: model.displayName,
    parameters: parameters.filter((parameter) => parameter.value !== ""),
  };
}

export function defaultMergeRecoveryPolicy(): OperationsNestedRecoveryPolicy {
  return {
    deterministicRepairEnabled: true,
    cursorAgentFallbackEnabled: true,
  };
}

export function buildOutcome(
  id: string,
  label: string,
  destinationStatusId: string,
): OperationsOutcome {
  return { id, label, destinationStatusId, enabled: true };
}

export function buildBasicWorkflowLayout(): OperationsLayout["statusPositions"] {
  const rowY = 120;
  const gap = 280;
  return {
    [FIXTURE_STATUS_IDS.readyPlanning]: { x: 0, y: rowY },
    [FIXTURE_STATUS_IDS.readyBuild]: { x: gap, y: rowY },
    [FIXTURE_STATUS_IDS.prOpen]: { x: gap * 2, y: rowY },
    [FIXTURE_STATUS_IDS.pmReview]: { x: gap * 3, y: rowY },
    [FIXTURE_STATUS_IDS.needsRevision]: { x: gap * 3, y: rowY + 160 },
    [FIXTURE_STATUS_IDS.readyMerge]: { x: gap * 4, y: rowY },
    [FIXTURE_STATUS_IDS.blocked]: { x: gap * 2, y: rowY + 160 },
    [FIXTURE_STATUS_IDS.mergedDev]: { x: gap * 5, y: rowY },
    [FIXTURE_STATUS_IDS.engReview]: { x: gap * 3.5, y: rowY - 120 },
  };
}

export function buildBasicWorkflowRules(
  modelCatalog: OperationsModelCatalogEntry[],
): OperationsRule[] {
  const modelSelection = buildCursorModelSelection(modelCatalog, "composer-2.5", {
    fast: "false",
  });
  const ids = FIXTURE_STATUS_IDS;

  return [
    {
      id: "rule-fixture-planning",
      sourceStatusId: ids.readyPlanning,
      enabled: true,
      executorId: "planner-agent",
      modelSelection,
      outcomes: [
        buildOutcome("outcome-fixture-plan-complete", "Plan completed", ids.readyBuild),
        buildOutcome("outcome-fixture-plan-blocked", "Unable to proceed", ids.blocked),
      ],
    },
    {
      id: "rule-fixture-implementation",
      sourceStatusId: ids.readyBuild,
      enabled: true,
      executorId: "implementation-agent",
      modelSelection,
      outcomes: [
        buildOutcome(
          "outcome-fixture-build-complete",
          "Build completed / PR created",
          ids.prOpen,
        ),
        buildOutcome("outcome-fixture-build-blocked", "Unable to proceed", ids.blocked),
      ],
    },
    {
      id: "rule-fixture-handoff",
      sourceStatusId: ids.prOpen,
      enabled: true,
      executorId: "handoff-pm-review-prep",
      outcomes: [
        buildOutcome("outcome-fixture-handoff-complete", "Handoff completed", ids.pmReview),
      ],
    },
    {
      id: "rule-fixture-pm-review",
      sourceStatusId: ids.pmReview,
      enabled: true,
      executorId: "human-decision",
      outcomes: [
        buildOutcome(
          "outcome-fixture-pm-changes",
          "Changes requested",
          ids.needsRevision,
        ),
        buildOutcome("outcome-fixture-pm-approved", "Approved", ids.readyMerge),
      ],
    },
    {
      id: "rule-fixture-revision",
      sourceStatusId: ids.needsRevision,
      enabled: true,
      executorId: "revision-agent",
      modelSelection,
      outcomes: [
        buildOutcome("outcome-fixture-revision-complete", "Revision completed", ids.prOpen),
        buildOutcome("outcome-fixture-revision-blocked", "Unable to proceed", ids.blocked),
      ],
    },
    {
      id: "rule-fixture-merge",
      sourceStatusId: ids.readyMerge,
      enabled: true,
      executorId: "merge-runner",
      nestedRecoveryPolicy: defaultMergeRecoveryPolicy(),
      outcomes: [
        buildOutcome("outcome-fixture-merge-success", "Merged", ids.mergedDev),
        buildOutcome("outcome-fixture-merge-blocked", "Unable to proceed", ids.blocked),
      ],
    },
  ];
}

export function buildFixtureDraftShell(input: {
  draftId: string;
  context: OperationsSourceContext;
  baseSnapshot: OperationsBaseSnapshot;
  statusIdsOnCanvas: string[];
  rules: OperationsRule[];
  layout: OperationsLayout;
}): OperationsWorkflowDraft {
  return {
    schemaVersion: OPERATIONS_DRAFT_SCHEMA_VERSION,
    draftId: input.draftId,
    createdAt: FIXTURE_DRAFT_TIMESTAMP,
    updatedAt: FIXTURE_DRAFT_TIMESTAMP,
    savedByRuntime: "fixture-test",
    sourceMode: input.context.mode,
    baseSnapshot: input.baseSnapshot,
    statusIdsOnCanvas: input.statusIdsOnCanvas,
    rules: input.rules,
    layout: input.layout,
  };
}
