import type { HarnessConfig } from "../config/types.js";
import { DEFAULT_MODEL_ID } from "../config/defaults.js";
import {
  resolveModel,
  resolveModelId,
  STANDARD_MODEL_PARAMS,
} from "../cursor/model.js";

export type CursorModelConfigSource =
  | "agentProvider.model.id"
  | "defaultModel.id"
  | "code-default";

export interface CursorModelSettingsSummary {
  providerId: "cursor";
  resolvedModelId: string;
  configuredModelId?: string;
  source: CursorModelConfigSource;
  pinnedParams: ReadonlyArray<{ id: string; value: string }>;
  paramsControlledInCode: boolean;
  policyNote: string;
}

export function summarizeCursorModelSettings(
  config?: HarnessConfig,
): CursorModelSettingsSummary {
  const resolvedConfig = config ?? emptyConfig();
  const resolvedModelId = resolveModelId(resolvedConfig);
  const resolvedModel = resolveModel(resolvedConfig);

  let source: CursorModelConfigSource = "code-default";
  let configuredModelId: string | undefined;

  if (resolvedConfig.agentProvider?.model?.id) {
    source = "agentProvider.model.id";
    configuredModelId = resolvedConfig.agentProvider.model.id;
  } else if (resolvedConfig.defaultModel?.id) {
    source = "defaultModel.id";
    configuredModelId = resolvedConfig.defaultModel.id;
  }

  return {
    providerId: "cursor",
    resolvedModelId,
    configuredModelId,
    source,
    pinnedParams: resolvedModel.params ?? [...STANDARD_MODEL_PARAMS],
    paramsControlledInCode: true,
    policyNote:
      "Model ids are Cursor cloud agent selections. fast:false is pinned in code for cost control and is not user-editable in config.",
  };
}

export function defaultCursorModelIdForSetup(): string {
  return DEFAULT_MODEL_ID;
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
