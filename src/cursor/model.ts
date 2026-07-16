import type { HarnessConfig } from "../config/types.js";
import { DEFAULT_MODEL_ID } from "../config/defaults.js";
import type { RoleModelRole } from "../config/role-models.js";
import type { ModelParameterValue, ModelSelection } from "@cursor/sdk";

/**
 * Standard Composer 2.5 model parameters for legacy global-model resolution.
 *
 * When roleModels is absent, legacy configs resolve with fast:false pinned.
 */
export const STANDARD_MODEL_PARAMS: readonly ModelParameterValue[] = [
  { id: "fast", value: "false" },
];

export const LEGACY_COMPOSER_MODEL_ID = "composer-2.5";

function resolveLegacyModelId(config: HarnessConfig): string {
  return (
    config.agentProvider?.model?.id ??
    config.defaultModel?.id ??
    DEFAULT_MODEL_ID
  );
}

function legacyParamsForModelId(modelId: string): ModelParameterValue[] {
  if (modelId === LEGACY_COMPOSER_MODEL_ID || modelId === DEFAULT_MODEL_ID) {
    return [...STANDARD_MODEL_PARAMS];
  }
  return [];
}

function resolveExplicitRoleSelection(
  config: HarnessConfig,
  role: RoleModelRole,
): ModelSelection | undefined {
  const selection = config.roleModels?.[role];
  if (!selection?.id) {
    return undefined;
  }

  return {
    id: selection.id,
    ...(selection.params?.length ? { params: [...selection.params] } : {}),
  };
}

export function resolveModelId(config: HarnessConfig): string {
  return resolveLegacyModelId(config);
}

export function resolveModelIdForRole(
  config: HarnessConfig,
  role: RoleModelRole,
): string {
  const explicit = config.roleModels?.[role]?.id;
  if (explicit) {
    return explicit;
  }
  return resolveLegacyModelId(config);
}

export function resolvePlannerModel(config: HarnessConfig): ModelSelection {
  const explicit = resolveExplicitRoleSelection(config, "planner");
  if (explicit) {
    return explicit;
  }

  const id = resolveLegacyModelId(config);
  const params = legacyParamsForModelId(id);
  return params.length ? { id, params } : { id };
}

export function resolveBuilderModel(config: HarnessConfig): ModelSelection {
  const explicit = resolveExplicitRoleSelection(config, "builder");
  if (explicit) {
    return explicit;
  }

  const id = resolveLegacyModelId(config);
  const params = legacyParamsForModelId(id);
  return params.length ? { id, params } : { id };
}

export function resolveModelForRole(
  config: HarnessConfig,
  role: RoleModelRole,
): ModelSelection {
  return role === "planner"
    ? resolvePlannerModel(config)
    : resolveBuilderModel(config);
}

/** @deprecated Use resolveModelForRole(config, role) or role-specific helpers. */
export function resolveModel(config: HarnessConfig): ModelSelection {
  return resolvePlannerModel(config);
}

export function summarizeRoleModelSource(
  config: HarnessConfig,
  role: RoleModelRole,
): "roleModels" | "agentProvider.model.id" | "defaultModel.id" | "code-default" {
  if (config.roleModels?.[role]?.id) {
    return "roleModels";
  }
  if (config.agentProvider?.model?.id) {
    return "agentProvider.model.id";
  }
  if (config.defaultModel?.id) {
    return "defaultModel.id";
  }
  return "code-default";
}

export function manifestModelEvidence(
  config: HarnessConfig,
  role: RoleModelRole,
): {
  model: string;
  modelRole: RoleModelRole;
  modelParams: Array<{ id: string; value: string }> | null;
} {
  const selection = resolveModelForRole(config, role);
  return {
    model: selection.id,
    modelRole: role,
    modelParams: selection.params?.length ? [...selection.params] : null,
  };
}
