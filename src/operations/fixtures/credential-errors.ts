import type { OperationsFixtureDefinition } from "../fixture-definition.js";
import { buildCatalogUnavailableEntry } from "../model-catalog-utils.js";
import { getFixtureWorkflowScopes } from "./workflow-scopes.js";

export const credentialErrorsFixture: OperationsFixtureDefinition = {
  id: "credential-errors",
  workflowScopes: getFixtureWorkflowScopes(),
  statuses: [],
  modelCatalog: buildCatalogUnavailableEntry("fixture"),
  warnings: [
    "Fixture simulates missing or failed Linear/Cursor credential reads.",
  ],
};
