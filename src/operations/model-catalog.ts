import { summarizeCursorModelSettings } from "../setup/model-settings.js";
import type { HarnessConfig } from "../config/types.js";
import type { OperationsCurrentModelSummary, OperationsModelCatalogEntry } from "./types.js";
import type { CatalogLoadState } from "./types.js";
import {
  buildCatalogUnavailableEntry,
  normalizeCursorModelCatalog,
  type RawCursorModel,
} from "./model-catalog-utils.js";

export {
  buildCatalogUnavailableEntry,
  buildModelCatalogFingerprint,
  normalizeCursorModelCatalog,
} from "./model-catalog-utils.js";
export { lookupModelInCatalog } from "./model-catalog-lookup.js";

export function buildCurrentModelSummary(
  config?: HarnessConfig,
): OperationsCurrentModelSummary {
  const summary = summarizeCursorModelSettings(config);
  return {
    providerId: "cursor",
    resolvedModelId: summary.resolvedModelId,
    configuredModelId: summary.configuredModelId,
    source: summary.source,
    pinnedParams: summary.pinnedParams,
    policyNote: summary.policyNote,
    draftOnlyNote:
      "Draft model selections on the Operations canvas are prototype-only and do not change the active runtime model.",
  };
}

export interface ModelCatalogLoadResult {
  catalog: OperationsModelCatalogEntry[];
  loadState: CatalogLoadState;
}

export async function fetchLiveCursorModelCatalog(
  apiKey: string,
): Promise<ModelCatalogLoadResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const { Cursor } = await import("@cursor/sdk");
    const models = (await Cursor.models.list({
      apiKey: apiKey.trim(),
    })) as RawCursorModel[];
    return {
      catalog: normalizeCursorModelCatalog(models, "cursor-live", fetchedAt),
      loadState: "loaded",
    };
  } catch {
    return {
      catalog: buildCatalogUnavailableEntry("cursor-live"),
      loadState: "unavailable",
    };
  }
}
