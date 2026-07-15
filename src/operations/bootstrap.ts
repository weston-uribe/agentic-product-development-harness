import { randomUUID } from "node:crypto";
import type {
  OperationsBaseSnapshot,
  OperationsBootstrapPayload,
  OperationsLayout,
  OperationsRule,
  OperationsSourceContext,
  OperationsStatusRecord,
  OperationsValidationResult,
  OperationsWorkflowDraft,
} from "./types.js";
import { OPERATIONS_DRAFT_SCHEMA_VERSION } from "./constants.js";
import { getExecutorCatalog, getNestedCapabilities } from "./executor-catalog.js";
import {
  buildCurrentWorkflowMappings,
  buildWorkflowFingerprint,
  enrichStatusRecords,
  type LinearStatusInput,
} from "./current-workflow.js";
import { buildCurrentModelSummary } from "./model-catalog.js";
import { buildModelCatalogFingerprint } from "./model-catalog-utils.js";
import { buildStatusCatalogFingerprint } from "./linear-status-source.js";
import { hashOperationsFingerprint } from "./fingerprint.js";
import { validateOperationsDraft } from "./validation.js";
import { dataSourceLabel } from "./source-context.js";
import { loadDraft } from "./draft-store.js";
import { getFixtureDefinition } from "./fixtures/index.js";
import type { HarnessConfig } from "../config/types.js";
import type { OperationsModelCatalogEntry } from "./types.js";
import type { OperationsFixtureId } from "./constants.js";

export interface BootstrapDependencies {
  cwd: string;
  context: OperationsSourceContext;
  config?: HarnessConfig;
  teamId?: string;
  teamKey?: string;
  linearStatuses?: LinearStatusInput[];
  modelCatalog?: OperationsModelCatalogEntry[];
  warnings?: string[];
}

function defaultLayout(statuses: OperationsStatusRecord[]): OperationsLayout {
  const statusPositions: OperationsLayout["statusPositions"] = {};
  statuses.forEach((status, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    statusPositions[status.id] = {
      x: column * 280,
      y: row * 140,
    };
  });
  return { statusPositions, viewport: { x: 0, y: 0, zoom: 1 } };
}

function buildBaseSnapshot(input: {
  teamId?: string;
  teamKey?: string;
  config?: HarnessConfig;
  statuses: LinearStatusInput[];
  modelCatalog: OperationsModelCatalogEntry[];
  mappingsFingerprint: string;
}): OperationsBaseSnapshot {
  return {
    teamId: input.teamId,
    teamKey: input.teamKey,
    configFingerprint: hashOperationsFingerprint(input.config ?? {}),
    statusCatalogFingerprint: buildStatusCatalogFingerprint(input.statuses),
    modelCatalogFingerprint: buildModelCatalogFingerprint(input.modelCatalog),
    workflowFingerprint: hashOperationsFingerprint(input.mappingsFingerprint),
  };
}

function createDefaultRules(statuses: OperationsStatusRecord[]): OperationsRule[] {
  const rules: OperationsRule[] = [];
  for (const status of statuses) {
    if (!status.automationTriggerStatus) {
      continue;
    }
    let executorId = "human-decision";
    if (status.name.toLowerCase().includes("planning")) {
      executorId = "planner-agent";
    } else if (status.name.toLowerCase().includes("build")) {
      executorId = "implementation-agent";
    } else if (status.name.toLowerCase().includes("revision")) {
      executorId = "revision-agent";
    } else if (status.name.toLowerCase().includes("merge")) {
      executorId = "merge-runner";
    } else if (status.name.toLowerCase().includes("pr open")) {
      executorId = "handoff-pm-review-prep";
    }

    rules.push({
      id: randomUUID(),
      sourceStatusId: status.id,
      enabled: true,
      executorId,
      outcomes: [],
    });
  }
  return rules;
}

export function createBaselineDraft(input: {
  context: OperationsSourceContext;
  baseSnapshot: OperationsBaseSnapshot;
  statuses: OperationsStatusRecord[];
  savedByRuntime: OperationsWorkflowDraft["savedByRuntime"];
}): OperationsWorkflowDraft {
  const now = new Date().toISOString();
  const onCanvas = input.statuses
    .filter((status) => status.participatesInCurrentHarnessWorkflow)
    .map((status) => status.id);

  return {
    schemaVersion: OPERATIONS_DRAFT_SCHEMA_VERSION,
    draftId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    savedByRuntime: input.savedByRuntime,
    sourceMode: input.context.mode,
    baseSnapshot: input.baseSnapshot,
    statusIdsOnCanvas: onCanvas,
    rules: createDefaultRules(
      input.statuses.filter((status) => onCanvas.includes(status.id)),
    ),
    layout: defaultLayout(
      input.statuses.filter((status) => onCanvas.includes(status.id)),
    ),
  };
}

export async function buildOperationsBootstrap(
  deps: BootstrapDependencies,
): Promise<OperationsBootstrapPayload> {
  const warnings = [...(deps.warnings ?? [])];
  const context = deps.context;

  if (context.rejectionReason) {
    return {
      sourceMode: context.mode,
      fixtureId: context.fixtureId,
      dataSourceLabel: dataSourceLabel(context),
      statuses: [],
      executors: getExecutorCatalog(),
      nestedCapabilities: getNestedCapabilities(),
      currentWorkflowMappings: [],
      currentModel: buildCurrentModelSummary(deps.config),
      modelCatalog: deps.modelCatalog ?? [],
      draft: null,
      validation: {
        errors: [
          {
            id: "fixture-rejected",
            severity: "error",
            message: context.rejectionReason,
          },
        ],
        warnings: [],
        infos: [],
      },
      warnings: [context.rejectionReason],
    };
  }

  let linearStatuses = deps.linearStatuses ?? [];
  let modelCatalog = deps.modelCatalog ?? [];
  let config = deps.config;

  if (context.mode === "fixture" && context.fixtureId) {
    const fixture = getFixtureDefinition(context.fixtureId as OperationsFixtureId);
    linearStatuses = fixture.statuses;
    modelCatalog = fixture.modelCatalog;
    config = fixture.config ?? config;
    warnings.push(...fixture.warnings);
  }

  const statusRecords = enrichStatusRecords({
    config: config ?? emptyConfig(),
    statuses: linearStatuses,
    source: context.mode === "fixture" ? "fixture" : "linear-live",
  });
  const mappings = buildCurrentWorkflowMappings({
    config: config ?? emptyConfig(),
    statuses: linearStatuses,
    source: context.mode === "fixture" ? "fixture" : "linear-live",
  });
  const baseSnapshot = buildBaseSnapshot({
    teamId: deps.teamId,
    teamKey: deps.teamKey,
    config,
    statuses: linearStatuses,
    modelCatalog,
    mappingsFingerprint: buildWorkflowFingerprint(mappings),
  });

  let draft = await loadDraft(deps.cwd, context);
  if (!draft) {
    draft = createBaselineDraft({
      context,
      baseSnapshot,
      statuses: statusRecords,
      savedByRuntime:
        context.mode === "fixture" ? "fixture-test" : "source-gui",
    });
  }

  const validation = validateOperationsDraft({
    draft,
    statuses: statusRecords,
    executors: getExecutorCatalog(),
    modelCatalog,
    currentWorkflowMappings: mappings,
    baseSnapshot,
  });

  return {
    sourceMode: context.mode,
    fixtureId: context.fixtureId,
    dataSourceLabel: dataSourceLabel(context),
    statuses: statusRecords,
    executors: getExecutorCatalog(),
    nestedCapabilities: getNestedCapabilities(),
    currentWorkflowMappings: mappings,
    currentModel: buildCurrentModelSummary(config),
    modelCatalog,
    draft,
    validation,
    warnings,
  };
}

function emptyConfig(): HarnessConfig {
  return {
    version: 1,
    orchestratorMarker: "harness-orchestrator-v1",
    logDirectory: "runs",
    repos: [
      {
        id: "target-app",
        targetRepo: "https://github.com/owner/example-target-app",
        baseBranch: "main",
        productionBranch: "main",
      },
    ],
    allowedTargetRepos: ["https://github.com/owner/example-target-app"],
  };
}

export function mergeValidationResults(
  left: OperationsValidationResult,
  right: OperationsValidationResult,
): OperationsValidationResult {
  return {
    errors: [...left.errors, ...right.errors],
    warnings: [...left.warnings, ...right.warnings],
    infos: [...left.infos, ...right.infos],
  };
}
