import type { HarnessConfig } from "../config/types.js";
import type { OperationsFixtureId } from "./constants.js";
import type { OperationsModelCatalogEntry } from "./types.js";
import type { LinearStatusInput } from "./current-workflow.js";

export interface OperationsFixtureDefinition {
  id: OperationsFixtureId;
  statuses: LinearStatusInput[];
  modelCatalog: OperationsModelCatalogEntry[];
  config?: HarnessConfig;
  warnings: string[];
}
