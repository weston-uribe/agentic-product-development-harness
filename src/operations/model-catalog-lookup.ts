import type { OperationsModelCatalogEntry } from "./types.js";

export function lookupModelInCatalog(
  catalog: OperationsModelCatalogEntry[],
  modelId: string,
): OperationsModelCatalogEntry | undefined {
  return catalog.find((entry) => entry.id === modelId);
}
