import type { HarnessConfig } from "../config/types.js";
import type { OperationsFixtureId } from "./constants.js";
import type {
  OperationsBaseSnapshot,
  OperationsCurrentWorkflowMapping,
  OperationsModelCatalogEntry,
  OperationsSourceContext,
  OperationsStatusRecord,
  OperationsWorkflowDraft,
  OperationsWorkflowScope,
} from "./types.js";
import type { LinearStatusInput } from "./current-workflow.js";

export interface OperationsFixtureSeedInput {
  context: OperationsSourceContext;
  scope: OperationsWorkflowScope;
  baseSnapshot: OperationsBaseSnapshot;
  statuses: OperationsStatusRecord[];
  modelCatalog: OperationsModelCatalogEntry[];
  mappings: OperationsCurrentWorkflowMapping[];
}

export interface OperationsFixtureDefinition {
  id: OperationsFixtureId;
  statuses: LinearStatusInput[];
  modelCatalog: OperationsModelCatalogEntry[];
  workflowScopes: OperationsWorkflowScope[];
  config?: HarnessConfig;
  warnings: string[];
  buildSeedDraft?: (input: OperationsFixtureSeedInput) => OperationsWorkflowDraft;
}
