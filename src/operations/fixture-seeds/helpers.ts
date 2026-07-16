import type {
  OperationsBaseSnapshot,
  OperationsCurrentWorkflowMapping,
  OperationsDraftModelSelection,
  OperationsLayout,
  OperationsModelCatalogEntry,
  OperationsSourceContext,
  OperationsWorkflowDraft,
} from "../types.js";
import { createCanonicalBaselineDraft } from "../draft-migration.js";
import { getDefaultCanonicalLayout } from "../../workflow/canonical-product-development-workflow.js";
import type { CanonicalStatusKey } from "../../workflow/canonical-product-development-workflow.js";

export const FIXTURE_DRAFT_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/** Stable fixture status ids from basic-current-workflow. */
export const FIXTURE_STATUS_IDS = {
  backlog: "status-backlog",
  readyPlanning: "status-ready-planning",
  planning: "status-planning",
  readyBuild: "status-ready-build",
  building: "status-building",
  prOpen: "status-pr-open",
  pmReview: "status-pm-review",
  engReview: "status-eng-review",
  needsRevision: "status-needs-revision",
  revising: "status-revising",
  readyMerge: "status-ready-merge",
  merging: "status-merging",
  mergedDev: "status-merged-dev",
  mergedDeployed: "status-merged-deployed",
  blocked: "status-blocked",
  canceled: "status-canceled",
  duplicate: "status-duplicate",
} as const;

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

export function buildBasicWorkflowLayout(): OperationsLayout["statusPositions"] {
  const layout = getDefaultCanonicalLayout();
  layout["engineering-review"] = { x: 1960, y: -40 };
  layout["needs-revision"] = { x: 1680, y: 200 };
  layout["revising"] = { x: 1400, y: 200 };
  layout["blocked"] = { x: 1120, y: 400 };
  return layout;
}

export function buildBranchingWorkflowLayout(): OperationsLayout["statusPositions"] {
  const layout = buildBasicWorkflowLayout();
  layout["merged-to-dev"] = { x: 2800, y: 0 };
  layout["merged-deployed"] = { x: 3080, y: 0 };
  return layout;
}

export function buildFixturePhaseModelSettings(
  modelCatalog: OperationsModelCatalogEntry[],
): OperationsWorkflowDraft["phaseModelSettings"] {
  const modelSelection = buildCursorModelSelection(modelCatalog, "composer-2.5", {
    fast: "false",
  });
  if (!modelSelection) {
    return {};
  }
  return {
    planning: modelSelection,
    implementation: modelSelection,
    revision: modelSelection,
    "merge-integration-repair": modelSelection,
  };
}

export function buildFixtureDraftShell(input: {
  draftId: string;
  context: OperationsSourceContext;
  scopeId: string;
  baseSnapshot: OperationsBaseSnapshot;
  layout: OperationsLayout;
  phaseModelSettings?: OperationsWorkflowDraft["phaseModelSettings"];
}): OperationsWorkflowDraft {
  const draft = createCanonicalBaselineDraft({
    baseSnapshot: { ...input.baseSnapshot, scopeId: input.scopeId },
    sourceMode: input.context.mode,
    savedByRuntime: "fixture-test",
    layout: input.layout,
    phaseModelSettings: input.phaseModelSettings ?? {},
  });
  return {
    ...draft,
    draftId: input.draftId,
    createdAt: FIXTURE_DRAFT_TIMESTAMP,
    updatedAt: FIXTURE_DRAFT_TIMESTAMP,
  };
}

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

export function fixtureKeyForStatusId(statusId: string): CanonicalStatusKey | undefined {
  const entries = Object.entries(FIXTURE_STATUS_IDS) as Array<
    [string, string]
  >;
  const match = entries.find(([, id]) => id === statusId);
  if (!match) {
    return undefined;
  }
  const keyMap: Record<string, CanonicalStatusKey> = {
    backlog: "backlog",
    readyPlanning: "ready-for-planning",
    planning: "planning",
    readyBuild: "ready-for-build",
    building: "building",
    prOpen: "pr-open",
    pmReview: "pm-review",
    engReview: "engineering-review",
    needsRevision: "needs-revision",
    revising: "revising",
    readyMerge: "ready-to-merge",
    merging: "merging",
    mergedDev: "merged-to-dev",
    mergedDeployed: "merged-deployed",
    blocked: "blocked",
    canceled: "canceled",
    duplicate: "duplicate",
  };
  return keyMap[match[0]];
}
