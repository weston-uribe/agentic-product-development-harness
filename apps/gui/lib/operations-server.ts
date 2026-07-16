import "server-only";

import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";
import { loadHarnessDotenv } from "@harness/config/load-dotenv";
import { loadHarnessConfig } from "@harness/config/load-config";
import { readControlPlaneSetupState } from "@harness/setup/control-plane-setup-state";
import { loadSecretFromEnvLocal } from "@harness/setup/service-verification";
import { buildOperationsBootstrap } from "@harness/operations/bootstrap";
import { fetchLiveCursorModelCatalog } from "@harness/operations/model-catalog";
import { loadLiveLinearStatuses } from "@harness/operations/linear-status-source";
import {
  resolveOperationsSourceContext,
  type SourceContextRequest,
} from "@harness/operations/source-context";
import type { OperationsBootstrapPayload } from "@harness/operations/types";
import type { OperationsWorkflowDraft } from "@harness/operations/types";
import {
  deleteDraft,
  saveDraft,
  summarizeDraftForReport,
} from "@harness/operations/draft-store";
import { validateOperationsDraft } from "@harness/operations/validation";
import { getExecutorCatalog } from "@harness/operations/executor-catalog";
import {
  buildCurrentWorkflowMappings,
  buildWorkflowFingerprint,
  enrichStatusRecords,
  type LinearStatusInput,
} from "@harness/operations/current-workflow";
import type {
  OperationsBaseSnapshot,
  OperationsCatalogLoadMetadata,
  OperationsCurrentWorkflowMapping,
  OperationsExecutorCatalogEntry,
  OperationsModelCatalogEntry,
  OperationsSourceContext,
  OperationsStatusRecord,
  OperationsWorkflowScope,
} from "@harness/operations/types";
import { getFixtureDefinition } from "@harness/operations/fixtures";
import type { HarnessConfig } from "@harness/config/types";
import type { OperationsFixtureId } from "@harness/operations/constants";
import { buildCatalogUnavailableEntry } from "@harness/operations/model-catalog-utils";
import { buildLiveWorkflowScopes } from "@harness/operations/workflow-scopes";
import { buildOperationsBaseSnapshot } from "@harness/operations/bootstrap";

function isPackagedRuntime(): boolean {
  return Boolean(process.env.P_DEV_HOME?.trim());
}

function isDebugEnabled(): boolean {
  return process.env.P_DEV_OPERATIONS_DEBUG === "1";
}

const FALLBACK_CONFIG: HarnessConfig = {
  version: 1,
  orchestratorMarker: "harness-orchestrator-v1",
  logDirectory: "runs",
  repos: [],
  allowedTargetRepos: [],
};

interface ComposedOperationsContext {
  cwd: string;
  context: OperationsSourceContext;
  config?: HarnessConfig;
  effectiveConfig: HarnessConfig;
  scopes: OperationsWorkflowScope[];
  teamId?: string;
  teamKey?: string;
  linearStatuses: LinearStatusInput[];
  statuses: OperationsStatusRecord[];
  modelCatalog: OperationsModelCatalogEntry[];
  catalogLoadMetadata: OperationsCatalogLoadMetadata;
  currentWorkflowMappings: OperationsCurrentWorkflowMapping[];
  baseSnapshot: OperationsBaseSnapshot;
  executors: OperationsExecutorCatalogEntry[];
  warnings: string[];
  debugEnabled: boolean;
}

async function composeOperationsContext(
  requestOrContext: SourceContextRequest | OperationsSourceContext,
): Promise<ComposedOperationsContext> {
  const cwd = resolveHarnessRepoRoot();
  loadHarnessDotenv(cwd);
  const context =
    "mode" in requestOrContext
      ? requestOrContext
      : resolveOperationsSourceContext(requestOrContext);
  const warnings: string[] = [];
  const debugEnabled = isDebugEnabled();

  let config: HarnessConfig | undefined;
  try {
    ({ config } = await loadHarnessConfig({ baseDir: cwd }));
  } catch {
    if (debugEnabled) {
      warnings.push("Active harness config could not be loaded.");
    }
  }

  const setupState = await readControlPlaneSetupState(cwd);
  const teamId = setupState?.linear?.teamId;
  const teamKey = setupState?.linear?.teamKey;

  let linearStatuses: LinearStatusInput[] = [];
  let catalogLoadMetadata: OperationsCatalogLoadMetadata = {
    statusCatalog: "unavailable",
    modelCatalog: "unavailable",
  };

  if (context.mode === "live" && !context.rejectionReason) {
    const linearApiKey = await loadSecretFromEnvLocal({
      cwd,
      key: "LINEAR_API_KEY",
    });
    if (!linearApiKey) {
      if (debugEnabled) {
        warnings.push(
          "Validation limitation: LINEAR_API_KEY is not configured, so live Linear statuses could not be loaded.",
        );
      }
    } else if (!teamId) {
      if (debugEnabled) {
        warnings.push(
          "Validation limitation: Linear team is not configured in control-plane setup state.",
        );
      }
    } else {
      const result = await loadLiveLinearStatuses({
        apiKey: linearApiKey,
        teamId,
      });
      linearStatuses = result.statuses;
      catalogLoadMetadata = {
        ...catalogLoadMetadata,
        statusCatalog: result.loadState,
      };
      if (debugEnabled && result.warning) {
        warnings.push(result.warning);
      }
      if (debugEnabled && result.error) {
        warnings.push(`Linear status load failed: ${result.error}`);
      }
    }
  }

  let modelCatalog: OperationsModelCatalogEntry[] = [];
  if (context.mode === "live" && !context.rejectionReason) {
    const cursorApiKey = await loadSecretFromEnvLocal({
      cwd,
      key: "CURSOR_API_KEY",
    });
    if (!cursorApiKey) {
      if (debugEnabled) {
        warnings.push(
          "Validation limitation: CURSOR_API_KEY is not configured, so the live Cursor model catalog could not be loaded.",
        );
      }
      modelCatalog = buildCatalogUnavailableEntry("cursor-live");
      catalogLoadMetadata = {
        ...catalogLoadMetadata,
        modelCatalog: "unavailable",
      };
    } else {
      const result = await fetchLiveCursorModelCatalog(cursorApiKey);
      modelCatalog = result.catalog;
      catalogLoadMetadata = {
        ...catalogLoadMetadata,
        modelCatalog: result.loadState,
      };
    }
  }

  let effectiveConfig = config ?? FALLBACK_CONFIG;
  let scopes = buildLiveWorkflowScopes(effectiveConfig);

  if (context.mode === "fixture" && context.fixtureId && !context.rejectionReason) {
    const fixture = getFixtureDefinition(context.fixtureId as OperationsFixtureId);
    linearStatuses = fixture.statuses;
    modelCatalog = fixture.modelCatalog;
    effectiveConfig = fixture.config ?? effectiveConfig;
    scopes = fixture.workflowScopes;
    if (debugEnabled) {
      warnings.push(...fixture.warnings);
    }
    catalogLoadMetadata = { statusCatalog: "loaded", modelCatalog: "loaded" };
  }

  const currentWorkflowMappings = buildCurrentWorkflowMappings({
    config: effectiveConfig,
    statuses: linearStatuses,
    source: context.mode === "fixture" ? "fixture" : "linear-live",
  });
  const statuses = enrichStatusRecords({
    config: effectiveConfig,
    statuses: linearStatuses,
    source: context.mode === "fixture" ? "fixture" : "linear-live",
  });
  const baseSnapshot = buildOperationsBaseSnapshot({
    teamId,
    teamKey,
    config: effectiveConfig,
    statuses: linearStatuses,
    modelCatalog,
  });

  return {
    cwd,
    context,
    config,
    effectiveConfig,
    scopes,
    teamId,
    teamKey,
    linearStatuses,
    statuses,
    modelCatalog,
    catalogLoadMetadata,
    currentWorkflowMappings,
    baseSnapshot,
    executors: getExecutorCatalog(),
    warnings,
    debugEnabled,
  };
}

export async function loadOperationsBootstrap(
  request: SourceContextRequest,
): Promise<OperationsBootstrapPayload> {
  const composed = await composeOperationsContext(request);
  return buildOperationsBootstrap({
    cwd: composed.cwd,
    context: composed.context,
    config: composed.effectiveConfig,
    scopes: composed.scopes,
    teamId: composed.teamId,
    teamKey: composed.teamKey,
    linearStatuses: composed.linearStatuses,
    modelCatalog: composed.modelCatalog,
    catalogLoadMetadata: composed.catalogLoadMetadata,
    warnings: composed.warnings,
    debugEnabled: composed.debugEnabled,
  });
}

export async function persistOperationsDraft(input: {
  context: OperationsSourceContext;
  draft: OperationsWorkflowDraft;
}): Promise<{
  draft: OperationsWorkflowDraft;
  validation: ReturnType<typeof validateOperationsDraft>;
  summary: ReturnType<typeof summarizeDraftForReport>;
}> {
  const composed = await composeOperationsContext(input.context);
  const draftToSave: OperationsWorkflowDraft = {
    ...input.draft,
    updatedAt: new Date().toISOString(),
    savedByRuntime: isPackagedRuntime() ? "packaged-gui" : "source-gui",
  };

  const validation = validateOperationsDraft({
    draft: draftToSave,
    statuses: composed.statuses,
    modelCatalog: composed.modelCatalog,
    currentWorkflowMappings: composed.currentWorkflowMappings,
    baseSnapshot: composed.baseSnapshot,
    catalogLoadMetadata: composed.catalogLoadMetadata,
    config: composed.effectiveConfig,
  });
  const saved = await saveDraft(
    composed.cwd,
    input.context,
    draftToSave,
    composed.scopes,
  );

  return {
    draft: saved.draft,
    validation,
    summary: summarizeDraftForReport(saved.draft),
  };
}

export async function resetOperationsDraft(
  context: OperationsSourceContext,
): Promise<OperationsBootstrapPayload> {
  const composed = await composeOperationsContext(context);
  await deleteDraft(composed.cwd, context, composed.scopes);
  return buildOperationsBootstrap({
    cwd: composed.cwd,
    context,
    config: composed.effectiveConfig,
    scopes: composed.scopes,
    teamId: composed.teamId,
    teamKey: composed.teamKey,
    linearStatuses: composed.linearStatuses,
    modelCatalog: composed.modelCatalog,
    catalogLoadMetadata: composed.catalogLoadMetadata,
    warnings: composed.warnings,
    debugEnabled: composed.debugEnabled,
  });
}

export function sanitizeBootstrapPayload(
  payload: OperationsBootstrapPayload,
): OperationsBootstrapPayload {
  if (payload.debugEnabled) {
    return payload;
  }
  return {
    ...payload,
    warnings: [],
    currentWorkflowMappings: [],
  };
}
