import type {
  OperationsBaseSnapshot,
  OperationsBootstrapPayload,
  OperationsSourceContext,
  OperationsValidationResult,
} from "./types.js";
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
import { createLiveBaselineDraft } from "./baseline-workflow.js";
import type { HarnessConfig } from "../config/types.js";
import type {
  OperationsCatalogLoadMetadata,
  OperationsModelCatalogEntry,
} from "./types.js";
import type { OperationsFixtureId } from "./constants.js";

export interface BootstrapDependencies {
  cwd: string;
  context: OperationsSourceContext;
  config?: HarnessConfig;
  teamId?: string;
  teamKey?: string;
  linearStatuses?: LinearStatusInput[];
  modelCatalog?: OperationsModelCatalogEntry[];
  catalogLoadMetadata?: OperationsCatalogLoadMetadata;
  warnings?: string[];
}

export function buildOperationsBaseSnapshot(input: {
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
      catalogLoadMetadata: {
        statusCatalog: "unavailable",
        modelCatalog: "unavailable",
      },
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
  let catalogLoadMetadata: OperationsCatalogLoadMetadata =
    deps.catalogLoadMetadata ?? {
      statusCatalog: context.mode === "fixture" ? "loaded" : "unavailable",
      modelCatalog: context.mode === "fixture" ? "loaded" : "unavailable",
    };

  if (context.mode === "fixture" && context.fixtureId) {
    const fixture = getFixtureDefinition(context.fixtureId as OperationsFixtureId);
    linearStatuses = fixture.statuses;
    modelCatalog = fixture.modelCatalog;
    config = fixture.config ?? config;
    warnings.push(...fixture.warnings);
    catalogLoadMetadata = { statusCatalog: "loaded", modelCatalog: "loaded" };
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
  const baseSnapshot = buildOperationsBaseSnapshot({
    teamId: deps.teamId,
    teamKey: deps.teamKey,
    config,
    statuses: linearStatuses,
    modelCatalog,
    mappingsFingerprint: buildWorkflowFingerprint(mappings),
  });

  let draft = await loadDraft(deps.cwd, context);
  if (!draft) {
    const fixture =
      context.mode === "fixture" && context.fixtureId
        ? getFixtureDefinition(context.fixtureId as OperationsFixtureId)
        : undefined;

    if (fixture?.buildSeedDraft) {
      draft = fixture.buildSeedDraft({
        context,
        baseSnapshot,
        statuses: statusRecords,
        modelCatalog,
        mappings,
      });
    } else {
      draft = createLiveBaselineDraft({
        context,
        baseSnapshot,
        statuses: statusRecords,
        mappings,
        savedByRuntime:
          context.mode === "fixture" ? "fixture-test" : "source-gui",
      });
    }
  }

  const validation = validateOperationsDraft({
    draft,
    statuses: statusRecords,
    executors: getExecutorCatalog(),
    modelCatalog,
    currentWorkflowMappings: mappings,
    baseSnapshot,
    catalogLoadMetadata,
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
    catalogLoadMetadata,
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
