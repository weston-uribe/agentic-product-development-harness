import type {
  OperationsBaseSnapshot,
  OperationsBootstrapPayload,
  OperationsSourceContext,
  OperationsValidationResult,
  OperationsWorkflowScope,
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
import {
  loadDraft,
  migrateLegacyDraftIfNeeded,
} from "./draft-store.js";
import { getFixtureDefinition } from "./fixtures/index.js";
import { getFixtureWorkflowScopes } from "./fixtures/workflow-scopes.js";
import { createLiveBaselineDraft } from "./baseline-workflow.js";
import { buildLiveWorkflowScopes, validateRequestedScopeId } from "./workflow-scopes.js";
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
  scopes?: OperationsWorkflowScope[];
  debugEnabled?: boolean;
}

export function buildOperationsBaseSnapshot(input: {
  teamId?: string;
  teamKey?: string;
  scopeId?: string;
  config?: HarnessConfig;
  statuses: LinearStatusInput[];
  modelCatalog: OperationsModelCatalogEntry[];
  mappingsFingerprint: string;
}): OperationsBaseSnapshot {
  return {
    teamId: input.teamId,
    teamKey: input.teamKey,
    scopeId: input.scopeId,
    configFingerprint: hashOperationsFingerprint(input.config ?? {}),
    statusCatalogFingerprint: buildStatusCatalogFingerprint(input.statuses),
    modelCatalogFingerprint: buildModelCatalogFingerprint(input.modelCatalog),
    workflowFingerprint: hashOperationsFingerprint(input.mappingsFingerprint),
  };
}

function resolveScopes(deps: BootstrapDependencies): OperationsWorkflowScope[] {
  if (deps.scopes?.length) {
    return deps.scopes;
  }
  if (deps.context.mode === "fixture") {
    return getFixtureWorkflowScopes();
  }
  return buildLiveWorkflowScopes(deps.config ?? emptyConfig());
}

export async function buildOperationsBootstrap(
  deps: BootstrapDependencies,
): Promise<OperationsBootstrapPayload> {
  const warnings = [...(deps.warnings ?? [])];
  const context = deps.context;
  const scopes = resolveScopes(deps);
  const allowlist = new Map(scopes.map((scope) => [scope.id, scope]));
  const scopeResolution = validateRequestedScopeId(context.scopeId, allowlist);

  if (context.rejectionReason) {
    return rejectedPayload(context, scopes, warnings);
  }

  if (scopeResolution.error || !scopeResolution.scope) {
    return rejectedPayload(
      {
        ...context,
        rejectionReason: scopeResolution.error ?? "Workflow scope is required.",
      },
      scopes,
      warnings,
    );
  }

  const selectedScope = scopeResolution.scope;
  const contextWithScope: OperationsSourceContext = {
    ...context,
    scopeId: selectedScope.id,
  };

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
    if (process.env.P_DEV_OPERATIONS_DEBUG === "1") {
      warnings.push(...fixture.warnings);
    }
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
    scopeId: selectedScope.id,
    config,
    statuses: linearStatuses,
    modelCatalog,
    mappingsFingerprint: buildWorkflowFingerprint(mappings),
  });

  let legacyDraftReviewRequired = false;
  if (context.mode === "live") {
    const migration = await migrateLegacyDraftIfNeeded({
      cwd: deps.cwd,
      scopes,
    });
    if (migration.reviewRequired) {
      legacyDraftReviewRequired = true;
      warnings.push(migration.message!);
    } else if (migration.message) {
      warnings.push(migration.message);
    }
  }

  let draft = await loadDraft(deps.cwd, contextWithScope, scopes);
  if (!draft) {
    const fixture =
      context.mode === "fixture" && context.fixtureId
        ? getFixtureDefinition(context.fixtureId as OperationsFixtureId)
        : undefined;

    if (fixture?.buildSeedDraft) {
      draft = fixture.buildSeedDraft({
        context: contextWithScope,
        scope: selectedScope,
        baseSnapshot,
        statuses: statusRecords,
        modelCatalog,
        mappings,
      });
    } else {
      draft = createLiveBaselineDraft({
        context: contextWithScope,
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
    selectedScopeId: selectedScope.id,
    scopes,
    legacyDraftReviewRequired,
    debugEnabled: deps.debugEnabled ?? false,
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

function rejectedPayload(
  context: OperationsSourceContext,
  scopes: OperationsWorkflowScope[],
  warnings: string[],
): OperationsBootstrapPayload {
  const reason = context.rejectionReason ?? "Operations unavailable.";
  return {
    sourceMode: context.mode,
    fixtureId: context.fixtureId,
    selectedScopeId: undefined,
    scopes,
    legacyDraftReviewRequired: false,
    debugEnabled: false,
    dataSourceLabel: dataSourceLabel(context),
    statuses: [],
    executors: getExecutorCatalog(),
    nestedCapabilities: getNestedCapabilities(),
    currentWorkflowMappings: [],
    currentModel: buildCurrentModelSummary(undefined),
    modelCatalog: [],
    catalogLoadMetadata: {
      statusCatalog: "unavailable",
      modelCatalog: "unavailable",
    },
    draft: null,
    validation: {
      errors: [{ id: "operations-unavailable", severity: "error", message: reason }],
      warnings: [],
      infos: [],
    },
    warnings: [...warnings, reason],
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
        targetRepo: "https://github.com/weston-uribe/example-target-app",
        baseBranch: "main",
        productionBranch: "main",
      },
    ],
    allowedTargetRepos: ["https://github.com/weston-uribe/example-target-app"],
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
