import type { HarnessConfig } from "../config/types.js";
import type { RoleModelRole } from "../config/role-models.js";
import {
  resolveBuilderModel,
  resolvePlannerModel,
  summarizeRoleModelSource,
} from "../cursor/model.js";
import {
  validateCanonicalLinearWorkflow,
  type CanonicalValidationResult,
} from "../workflow/canonical-workflow-validation.js";
import type {
  WorkflowBootstrapPayload,
  WorkflowCatalogLoadMetadata,
  WorkflowModelCatalogEntry,
  WorkflowModelSelection,
  WorkflowScope,
  WorkflowSourceContext,
} from "./types.js";
import { buildModelSaveReadiness } from "./catalog-validation.js";
import { dataSourceLabel } from "./source-context.js";
import { getFixtureDefinition } from "./fixtures/index.js";
import { getFixtureWorkflowScopes } from "./fixtures/workflow-scopes.js";
import { emptyHarnessConfig } from "./model-catalog.js";
import { lookupModelInCatalog } from "./model-catalog-lookup.js";
import { hashWorkflowFingerprint } from "./fingerprint.js";
import { buildLiveWorkflowScopes, validateRequestedScopeId } from "./workflow-scopes.js";
import { enrichWorkflowScopes } from "./scope-branches.js";
import {
  buildCurrentWorkflowMappings,
  enrichStatusRecords,
  type LinearStatusInput,
} from "./current-workflow.js";
import type { WorkflowFixtureId } from "./constants.js";
import type { WorkflowHealthState } from "./types.js";

export interface WorkflowBootstrapDependencies {
  cwd: string;
  context: WorkflowSourceContext;
  config?: HarnessConfig;
  teamId?: string;
  teamKey?: string;
  linearStatuses?: LinearStatusInput[];
  modelCatalog?: WorkflowModelCatalogEntry[];
  catalogLoadMetadata?: WorkflowCatalogLoadMetadata;
  warnings?: string[];
  scopes?: WorkflowScope[];
  debugEnabled?: boolean;
}

export function buildConfigFingerprint(config?: HarnessConfig): string {
  return hashWorkflowFingerprint(config ?? {});
}

function buildWorkflowModelSelection(
  config: HarnessConfig,
  role: RoleModelRole,
  modelCatalog: WorkflowModelCatalogEntry[],
): WorkflowModelSelection {
  const resolved = role === "planner" ? resolvePlannerModel(config) : resolveBuilderModel(config);
  const catalogEntry = lookupModelInCatalog(modelCatalog, resolved.id);
  return {
    modelId: resolved.id,
    displayName: catalogEntry?.displayName ?? resolved.id,
    parameters: resolved.params?.map((parameter) => ({
      id: parameter.id,
      value: parameter.value,
    })) ?? [],
    source: summarizeRoleModelSource(config, role),
  };
}

function resolveScopes(deps: WorkflowBootstrapDependencies): WorkflowScope[] {
  const raw =
    deps.scopes?.length
      ? deps.scopes
      : deps.context.mode === "fixture"
        ? getFixtureWorkflowScopes()
        : buildLiveWorkflowScopes(deps.config ?? emptyHarnessConfig());
  return enrichWorkflowScopes(raw, deps.config);
}

function buildCanonicalValidation(input: {
  statuses: LinearStatusInput[];
  config?: HarnessConfig;
  catalogLoadMetadata: WorkflowCatalogLoadMetadata;
}): CanonicalValidationResult | undefined {
  if (input.catalogLoadMetadata.statusCatalog !== "loaded") {
    return undefined;
  }
  return validateCanonicalLinearWorkflow({
    workflowStates: input.statuses.map((status) => ({
      id: status.id,
      name: status.name,
      category: status.type,
    })),
    config: input.config,
  });
}

function deriveWorkflowHealthState(input: {
  catalogLoadMetadata: WorkflowCatalogLoadMetadata;
  canonicalValidation?: CanonicalValidationResult;
}): WorkflowHealthState {
  if (input.catalogLoadMetadata.statusCatalog === "unavailable") {
    return "linear-unavailable";
  }
  if (input.canonicalValidation && !input.canonicalValidation.valid) {
    return "blocking-configuration-error";
  }
  return "healthy";
}

export async function buildWorkflowBootstrap(
  deps: WorkflowBootstrapDependencies,
): Promise<WorkflowBootstrapPayload> {
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
  const effectiveConfig = deps.config ?? emptyHarnessConfig();

  let linearStatuses = deps.linearStatuses ?? [];
  let modelCatalog = deps.modelCatalog ?? [];
  let config = deps.config;
  let catalogLoadMetadata: WorkflowCatalogLoadMetadata =
    deps.catalogLoadMetadata ?? {
      statusCatalog: context.mode === "fixture" ? "loaded" : "unavailable",
      modelCatalog: context.mode === "fixture" ? "loaded" : "unavailable",
    };

  if (context.mode === "fixture" && context.fixtureId) {
    const fixture = getFixtureDefinition(context.fixtureId as WorkflowFixtureId);
    linearStatuses = fixture.statuses;
    modelCatalog = fixture.modelCatalog;
    config = fixture.config ?? config;
    if (process.env.P_DEV_OPERATIONS_DEBUG === "1") {
      warnings.push(...fixture.warnings);
    }
    catalogLoadMetadata = { statusCatalog: "loaded", modelCatalog: "loaded" };
  }

  const statusRecords = enrichStatusRecords({
    config: effectiveConfig,
    statuses: linearStatuses,
    source: context.mode === "fixture" ? "fixture" : "linear-live",
  });
  const mappings = buildCurrentWorkflowMappings({
    config: effectiveConfig,
    statuses: linearStatuses,
    source: context.mode === "fixture" ? "fixture" : "linear-live",
  });
  const canonicalValidation = buildCanonicalValidation({
    statuses: linearStatuses,
    config,
    catalogLoadMetadata,
  });

  const plannerSelection = buildWorkflowModelSelection(
    effectiveConfig,
    "planner",
    modelCatalog,
  );
  const builderSelection = buildWorkflowModelSelection(
    effectiveConfig,
    "builder",
    modelCatalog,
  );
  const modelSaveReadiness = buildModelSaveReadiness({
    plannerSelection,
    builderSelection,
    modelCatalog,
    catalogLoaded: catalogLoadMetadata.modelCatalog === "loaded",
  });

  const healthState = deriveWorkflowHealthState({
    catalogLoadMetadata,
    canonicalValidation,
  });

  return {
    sourceMode: context.mode,
    fixtureId: context.fixtureId,
    selectedScopeId: selectedScope.id,
    scopes,
    debugEnabled: deps.debugEnabled ?? false,
    dataSourceLabel: dataSourceLabel(context),
    statuses: statusRecords,
    currentWorkflowMappings: mappings,
    modelCatalog,
    catalogLoadMetadata,
    plannerSelection,
    builderSelection,
    configFingerprint: buildConfigFingerprint(config),
    modelSaveReadiness,
    canonicalWorkflow: {
      healthState,
      violations: canonicalValidation?.violations ?? [],
      informationalWarnings: canonicalValidation?.informationalWarnings ?? [],
      resolvedStatusIds: Object.fromEntries(
        Object.entries(canonicalValidation?.resolvedStatuses ?? {}).map(
          ([key, value]) => [key, value.id],
        ),
      ),
      mergePathVariant:
        selectedScope.baseBranch === selectedScope.productionBranch
          ? "direct-production"
          : "integration-then-production",
    },
    warnings,
  };
}

function rejectedPayload(
  context: WorkflowSourceContext,
  scopes: WorkflowScope[],
  warnings: string[],
): WorkflowBootstrapPayload {
  const emptyConfig = emptyHarnessConfig();
  const plannerSelection = buildWorkflowModelSelection(emptyConfig, "planner", []);
  const builderSelection = buildWorkflowModelSelection(emptyConfig, "builder", []);

  return {
    sourceMode: context.mode,
    fixtureId: context.fixtureId,
    selectedScopeId: undefined,
    scopes,
    debugEnabled: false,
    dataSourceLabel: dataSourceLabel(context),
    statuses: [],
    currentWorkflowMappings: [],
    modelCatalog: [],
    catalogLoadMetadata: {
      statusCatalog: "unavailable",
      modelCatalog: "unavailable",
    },
    plannerSelection,
    builderSelection,
    configFingerprint: buildConfigFingerprint(undefined),
    modelSaveReadiness: buildModelSaveReadiness({
      plannerSelection,
      builderSelection,
      modelCatalog: [],
      catalogLoaded: false,
    }),
    canonicalWorkflow: {
      healthState: "linear-unavailable",
      violations: [],
      informationalWarnings: [],
      resolvedStatusIds: {},
      mergePathVariant: "direct-production",
    },
    warnings,
  };
}

export { buildWorkflowFingerprint } from "./current-workflow.js";
