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
  enrichStatusRecords,
} from "@harness/operations/current-workflow";
import type { OperationsSourceContext } from "@harness/operations/types";

function isPackagedRuntime(): boolean {
  return Boolean(process.env.P_DEV_HOME?.trim());
}

export async function loadOperationsBootstrap(
  request: SourceContextRequest,
): Promise<OperationsBootstrapPayload> {
  const cwd = resolveHarnessRepoRoot();
  loadHarnessDotenv(cwd);
  const context = resolveOperationsSourceContext(request);
  const warnings: string[] = [];

  let config;
  try {
    ({ config } = await loadHarnessConfig({ baseDir: cwd }));
  } catch {
    warnings.push("Active harness config could not be loaded.");
  }

  const setupState = await readControlPlaneSetupState(cwd);
  const teamId = setupState?.linear?.teamId;
  const teamKey = setupState?.linear?.teamKey;

  let linearStatuses = undefined;
  if (context.mode === "live" && !context.rejectionReason) {
    const linearApiKey = await loadSecretFromEnvLocal({
      cwd,
      key: "LINEAR_API_KEY",
    });
    if (!linearApiKey) {
      warnings.push("LINEAR_API_KEY is not configured.");
    } else if (!teamId) {
      warnings.push("Linear team is not configured in control-plane setup state.");
    } else {
      const result = await loadLiveLinearStatuses({
        apiKey: linearApiKey,
        teamId,
      });
      linearStatuses = result.statuses;
      if (result.warning) {
        warnings.push(result.warning);
      }
      if (result.error) {
        warnings.push(`Linear status load failed: ${result.error}`);
      }
    }
  }

  let modelCatalog = undefined;
  if (context.mode === "live" && !context.rejectionReason) {
    const cursorApiKey = await loadSecretFromEnvLocal({
      cwd,
      key: "CURSOR_API_KEY",
    });
    if (!cursorApiKey) {
      warnings.push("CURSOR_API_KEY is not configured.");
      modelCatalog = [];
    } else {
      modelCatalog = await fetchLiveCursorModelCatalog(cursorApiKey);
    }
  }

  return buildOperationsBootstrap({
    cwd,
    context,
    config,
    teamId,
    teamKey,
    linearStatuses,
    modelCatalog,
    warnings,
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
  const cwd = resolveHarnessRepoRoot();
  const saved = await saveDraft(cwd, input.context, {
    ...input.draft,
    updatedAt: new Date().toISOString(),
    savedByRuntime: isPackagedRuntime() ? "packaged-gui" : "source-gui",
  });

  const statuses = enrichStatusRecords({
    config: (await loadHarnessConfig({ baseDir: cwd }).catch(() => null))?.config ?? {
      version: 1,
      orchestratorMarker: "harness-orchestrator-v1",
      logDirectory: "runs",
      repos: [],
      allowedTargetRepos: [],
    },
    statuses: [],
    source: input.context.mode === "fixture" ? "fixture" : "linear-live",
  });

  const validation = validateOperationsDraft({
    draft: saved.draft,
    statuses,
    executors: getExecutorCatalog(),
    modelCatalog: [],
    currentWorkflowMappings: buildCurrentWorkflowMappings({
      config: (await loadHarnessConfig({ baseDir: cwd }).catch(() => null))?.config ?? {
        version: 1,
        orchestratorMarker: "harness-orchestrator-v1",
        logDirectory: "runs",
        repos: [],
        allowedTargetRepos: [],
      },
      statuses: [],
      source: input.context.mode === "fixture" ? "fixture" : "linear-live",
    }),
    baseSnapshot: saved.draft.baseSnapshot,
  });

  return {
    draft: saved.draft,
    validation,
    summary: summarizeDraftForReport(saved.draft),
  };
}

export async function resetOperationsDraft(
  context: OperationsSourceContext,
): Promise<OperationsBootstrapPayload> {
  const cwd = resolveHarnessRepoRoot();
  await deleteDraft(cwd, context);
  return loadOperationsBootstrap({
    source: context.mode,
    fixture: context.fixtureId ?? null,
    fixturesEnabled: context.fixturesEnabled,
  });
}

export function sanitizeBootstrapPayload(
  payload: OperationsBootstrapPayload,
): OperationsBootstrapPayload {
  return payload;
}
