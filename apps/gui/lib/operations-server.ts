import "server-only";

import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";
import { loadHarnessDotenv } from "@harness/config/load-dotenv";
import { loadHarnessConfig } from "@harness/config/load-config";
import { readControlPlaneSetupState } from "@harness/setup/control-plane-setup-state";
import { loadSecretFromEnvLocal } from "@harness/setup/service-verification";
import {
  buildOperationsBaseSnapshot,
  buildOperationsBootstrap,
} from "@harness/operations/bootstrap";
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
  OperationsCurrentWorkflowMapping,
  OperationsExecutorCatalogEntry,
  OperationsModelCatalogEntry,
  OperationsSourceContext,
  OperationsStatusRecord,
} from "@harness/operations/types";
import { getFixtureDefinition } from "@harness/operations/fixtures";
import type { HarnessConfig } from "@harness/config/types";
import type { OperationsFixtureId } from "@harness/operations/constants";

function isPackagedRuntime(): boolean {
  return Boolean(process.env.P_DEV_HOME?.trim());
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
  teamId?: string;
  teamKey?: string;
  linearStatuses: LinearStatusInput[];
  statuses: OperationsStatusRecord[];
  modelCatalog: OperationsModelCatalogEntry[];
  currentWorkflowMappings: OperationsCurrentWorkflowMapping[];
  baseSnapshot: OperationsBaseSnapshot;
  executors: OperationsExecutorCatalogEntry[];
  warnings: string[];
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

  let config: HarnessConfig | undefined;
  try {
    ({ config } = await loadHarnessConfig({ baseDir: cwd }));
  } catch {
    warnings.push("Active harness config could not be loaded.");
  }

  const setupState = await readControlPlaneSetupState(cwd);
  const teamId = setupState?.linear?.teamId;
  const teamKey = setupState?.linear?.teamKey;

  let linearStatuses: LinearStatusInput[] = [];
  if (context.mode === "live" && !context.rejectionReason) {
    const linearApiKey = await loadSecretFromEnvLocal({
      cwd,
      key: "LINEAR_API_KEY",
    });
    if (!linearApiKey) {
      warnings.push(
        "Validation limitation: LINEAR_API_KEY is not configured, so live Linear statuses could not be loaded.",
      );
    } else if (!teamId) {
      warnings.push(
        "Validation limitation: Linear team is not configured in control-plane setup state.",
      );
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

  let modelCatalog: OperationsModelCatalogEntry[] = [];
  if (context.mode === "live" && !context.rejectionReason) {
    const cursorApiKey = await loadSecretFromEnvLocal({
      cwd,
      key: "CURSOR_API_KEY",
    });
    if (!cursorApiKey) {
      warnings.push(
        "Validation limitation: CURSOR_API_KEY is not configured, so the live Cursor model catalog could not be loaded.",
      );
      modelCatalog = [];
    } else {
      modelCatalog = await fetchLiveCursorModelCatalog(cursorApiKey);
    }
  }

  let effectiveConfig = config ?? FALLBACK_CONFIG;
  if (context.mode === "fixture" && context.fixtureId && !context.rejectionReason) {
    const fixture = getFixtureDefinition(context.fixtureId as OperationsFixtureId);
    linearStatuses = fixture.statuses;
    modelCatalog = fixture.modelCatalog;
    effectiveConfig = fixture.config ?? effectiveConfig;
    warnings.push(...fixture.warnings);
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
    mappingsFingerprint: buildWorkflowFingerprint(currentWorkflowMappings),
  });

  return {
    cwd,
    context,
    config,
    effectiveConfig,
    teamId,
    teamKey,
    linearStatuses,
    statuses,
    modelCatalog,
    currentWorkflowMappings,
    baseSnapshot,
    executors: getExecutorCatalog(),
    warnings,
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
    teamId: composed.teamId,
    teamKey: composed.teamKey,
    linearStatuses: composed.linearStatuses,
    modelCatalog: composed.modelCatalog,
    warnings: composed.warnings,
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
    executors: composed.executors,
    modelCatalog: composed.modelCatalog,
    currentWorkflowMappings: composed.currentWorkflowMappings,
    baseSnapshot: composed.baseSnapshot,
  });
  const saved = await saveDraft(composed.cwd, input.context, draftToSave);

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
