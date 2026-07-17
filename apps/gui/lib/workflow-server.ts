import "server-only";

import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";
import { loadHarnessDotenv } from "@harness/config/load-dotenv";
import { loadHarnessConfig } from "@harness/config/load-config";
import {
  buildWorkflowBootstrap,
} from "@harness/workflow-page/bootstrap";
import { fetchLiveCursorModelCatalog } from "@harness/workflow-page/model-catalog";
import { loadLiveLinearStatuses } from "@harness/workflow-page/linear-status-source";
import {
  resolveWorkflowSourceContext,
  type SourceContextRequest,
} from "@harness/workflow-page/source-context";
import type { WorkflowBootstrapPayload } from "@harness/workflow-page/types";
import { getFixtureDefinition } from "@harness/workflow-page/fixtures";
import type { HarnessConfig } from "@harness/config/types";
import type { WorkflowFixtureId } from "@harness/workflow-page/constants";
import { buildCatalogUnavailableEntry } from "@harness/workflow-page/model-catalog-utils";
import { loadSecretFromEnvLocal } from "@harness/setup/service-verification";
import { readControlPlaneSetupState } from "@harness/setup/control-plane-setup-state";
import {
  WorkflowModelSyncError,
  type WorkflowModelSaveRequest,
  type WorkflowModelSaveResult,
} from "@harness/setup/workflow-model-sync";
import { enqueueWorkflowModelSave } from "@harness/setup/workflow-model-save-queue";
import { readWorkflowConfigSnapshot } from "@harness/setup/workflow-config-snapshot";
import { validateModelSavePayload } from "@harness/workflow-page/catalog-validation";
import { createLiveGitHubRemoteSetupProvider } from "@harness/setup/github-remote-setup-live";
import {
  getFixtureRoleModels,
  saveFixtureRoleModel,
} from "@harness/workflow-page/fixture-role-models";
import {
  isWorkflowCloudConfigSynchronized,
  readWorkflowModelsSyncEvidence,
} from "@harness/setup/workflow-models-sync-evidence";
import { isRoleModelRole } from "@harness/config/role-models";

function isDebugEnabled(): boolean {
  return (
    process.env.P_DEV_WORKFLOW_DEBUG === "1" ||
    process.env.P_DEV_OPERATIONS_DEBUG === "1"
  );
}

const FALLBACK_CONFIG: HarnessConfig = {
  version: 1,
  orchestratorMarker: "harness-orchestrator-v1",
  logDirectory: "runs",
  repos: [],
  allowedTargetRepos: [],
};

export async function loadWorkflowBootstrap(
  request: SourceContextRequest,
): Promise<WorkflowBootstrapPayload> {
  const cwd = resolveHarnessWorkspaceDir();
  loadHarnessDotenv(cwd);
  const context = resolveWorkflowSourceContext(request);
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
  const teamKey = setupState?.linear?.teamKey ?? config?.linear?.teamKey;

  let linearStatuses: Awaited<ReturnType<typeof loadLiveLinearStatuses>>["statuses"] =
    [];
  let catalogLoadMetadata = {
    statusCatalog: context.mode === "fixture" ? ("loaded" as const) : ("unavailable" as const),
    modelCatalog: context.mode === "fixture" ? ("loaded" as const) : ("unavailable" as const),
  };
  let modelCatalog = buildCatalogUnavailableEntry("cursor-live");

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
    } else {
      const catalogResult = await fetchLiveCursorModelCatalog(cursorApiKey);
      modelCatalog = catalogResult.catalog;
      catalogLoadMetadata = {
        ...catalogLoadMetadata,
        modelCatalog: catalogResult.loadState,
      };
    }
  }

  let effectiveConfig = config ?? FALLBACK_CONFIG;
  let liveConfigFingerprint: string | undefined;
  if (context.mode === "live") {
    try {
      const snapshot = await readWorkflowConfigSnapshot(cwd);
      effectiveConfig = snapshot.config;
      liveConfigFingerprint = snapshot.fingerprint;
    } catch {
      if (debugEnabled) {
        warnings.push("Local harness config could not be loaded for fingerprinting.");
      }
    }
  }
  if (context.mode === "fixture" && context.fixtureId) {
    const fixture = getFixtureDefinition(context.fixtureId as WorkflowFixtureId);
    effectiveConfig = fixture.config ?? effectiveConfig;
    modelCatalog = fixture.modelCatalog;
    catalogLoadMetadata = { statusCatalog: "loaded", modelCatalog: "loaded" };
    linearStatuses = fixture.statuses;
    const fixtureRoleModels = getFixtureRoleModels(
      context.fixtureId,
      context.scopeId ?? effectiveConfig.repos[0]?.id ?? "default",
    );
    if (fixtureRoleModels) {
      effectiveConfig = { ...effectiveConfig, roleModels: fixtureRoleModels };
    }
  }

  const payload = await buildWorkflowBootstrap({
    cwd,
    context,
    config: effectiveConfig,
    configFingerprint: liveConfigFingerprint,
    teamId,
    teamKey,
    linearStatuses,
    modelCatalog,
    catalogLoadMetadata,
    warnings,
    debugEnabled,
  });

  if (context.mode === "live" && liveConfigFingerprint) {
    const evidence = await readWorkflowModelsSyncEvidence(cwd);
    const synchronized = isWorkflowCloudConfigSynchronized({
      currentFingerprint: liveConfigFingerprint,
      evidence,
    });
    if (!synchronized) {
      payload.warnings.push(
        "Workflow cloud configuration is not synchronized with the local harness config.",
      );
    }
  }

  return payload;
}

export async function saveWorkflowModel(
  input: WorkflowModelSaveRequest & {
    sourceMode: "live" | "fixture";
    fixtureId?: string;
    scopeId?: string;
  },
): Promise<WorkflowModelSaveResult> {
  if (!isRoleModelRole(input.role)) {
    throw new WorkflowModelSyncError(
      "workflow_model_validation_failed",
      `Unknown role "${input.role}".`,
    );
  }

  const cwd = resolveHarnessWorkspaceDir();
  loadHarnessDotenv(cwd);

  if (input.sourceMode === "fixture") {
    if (!input.fixtureId || !input.scopeId) {
      throw new WorkflowModelSyncError(
        "workflow_model_validation_failed",
        "Fixture saves require fixture and scope identifiers.",
      );
    }
    const fixture = getFixtureDefinition(input.fixtureId as WorkflowFixtureId);
    const catalogLoaded = fixture.modelCatalog.some(
      (entry) => entry.availability === "available",
    );
    const validation = validateModelSavePayload({
      role: input.role,
      selection: { modelId: input.modelId, parameters: input.params },
      modelCatalog: fixture.modelCatalog,
      catalogLoaded,
    });
    if (!validation.valid) {
      throw new WorkflowModelSyncError(
        validation.state === "catalog-unavailable"
          ? "workflow_model_catalog_unavailable"
          : "workflow_model_validation_failed",
        validation.issues.join(" "),
      );
    }

    const baseConfig = fixture.config ?? FALLBACK_CONFIG;
    const saved = saveFixtureRoleModel({
      fixtureId: input.fixtureId,
      scopeId: input.scopeId,
      baseConfig,
      role: input.role,
      modelId: input.modelId,
      params: input.params,
    });

    return {
      saved: true,
      role: input.role,
      modelSelection: input.params.length
        ? { id: input.modelId, params: input.params }
        : { id: input.modelId },
      configFingerprint: saved.configFingerprint,
      localConfigUpdated: true,
      cloudConfigUpdated: true,
      savedAt: new Date().toISOString(),
    };
  }

  const cursorApiKey = await loadSecretFromEnvLocal({
    cwd,
    key: "CURSOR_API_KEY",
  });
  let modelCatalog = buildCatalogUnavailableEntry("cursor-live");
  let catalogLoaded = false;
  if (cursorApiKey) {
    const catalogResult = await fetchLiveCursorModelCatalog(cursorApiKey);
    modelCatalog = catalogResult.catalog;
    catalogLoaded = catalogResult.loadState === "loaded";
  }

  const validation = validateModelSavePayload({
    role: input.role,
    selection: { modelId: input.modelId, parameters: input.params },
    modelCatalog,
    catalogLoaded,
  });
  if (!validation.valid) {
    throw new WorkflowModelSyncError(
      validation.state === "catalog-unavailable"
        ? "workflow_model_catalog_unavailable"
        : "workflow_model_validation_failed",
      validation.issues.join(" "),
    );
  }

  const githubToken = await loadSecretFromEnvLocal({
    cwd,
    key: "GITHUB_TOKEN",
  });
  const provider = githubToken
    ? createLiveGitHubRemoteSetupProvider(githubToken)
    : undefined;

  return enqueueWorkflowModelSave({
    cwd,
    request: input,
    provider,
  }).then((outcome) => outcome.result);
}

export { WorkflowModelSyncError };
