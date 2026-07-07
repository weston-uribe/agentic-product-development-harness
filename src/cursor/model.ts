import type { HarnessConfig } from "../config/types.js";
import { DEFAULT_MODEL_ID } from "../config/defaults.js";
import type { ModelSelection } from "@cursor/sdk";

export function resolveModel(config: HarnessConfig): ModelSelection {
  return { id: config.defaultModel?.id ?? DEFAULT_MODEL_ID };
}

export function resolveModelId(config: HarnessConfig): string {
  return resolveModel(config).id;
}
