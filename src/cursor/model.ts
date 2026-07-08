import type { HarnessConfig } from "../config/types.js";
import { DEFAULT_MODEL_ID } from "../config/defaults.js";
import type { ModelParameterValue, ModelSelection } from "@cursor/sdk";

/**
 * Standard Composer 2.5 model parameters for every harness-created Cursor Cloud
 * agent.
 *
 * The harness intentionally launches Cursor Cloud agents with the standard /
 * basic Composer 2.5 configuration to control Cursor usage cost. It must NOT
 * request any premium / faster / max variant.
 *
 * The Cursor SDK exposes model selection as `ModelSelection = { id, params? }`
 * (see `@cursor/sdk`). `params` (an array of `{ id, value }`) is the lever the
 * public SDK surface exposes for opting into model variants.
 *
 * Evidence from `Cursor.models.list()` for `composer-2.5`:
 *   - Its only parameter is `fast` (`"true"` / `"false"`).
 *   - The **default variant is `fast: "true"`** — so when `params` is omitted,
 *     the cloud server resolves the Fast variant, which is why harness agents
 *     showed up as "Composer 2.5 Fast" in the usage dashboard.
 *   - There is no `max_mode` / reasoning parameter exposed for this model, so
 *     the SDK cannot request Max mode / high reasoning here; the safest,
 *     lowest-cost configuration is simply Fast disabled.
 *
 * We therefore pin `fast: "false"` explicitly so agents always use standard
 * Composer 2.5 instead of the Fast default. Changing model or mode must be a
 * deliberate config/code change here — never an accidental default.
 */
export const STANDARD_MODEL_PARAMS: readonly ModelParameterValue[] = [
  { id: "fast", value: "false" },
];

export function resolveModelId(config: HarnessConfig): string {
  return (
    config.agentProvider?.model?.id ??
    config.defaultModel?.id ??
    DEFAULT_MODEL_ID
  );
}

export function resolveModel(config: HarnessConfig): ModelSelection {
  return {
    id: resolveModelId(config),
    params: [...STANDARD_MODEL_PARAMS],
  };
}
