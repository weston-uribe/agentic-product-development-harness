import type { OperationsFixtureDefinition } from "../fixture-definition.js";
import { getFixtureWorkflowScopes } from "./workflow-scopes.js";

export const emptyLinearStatusesFixture: OperationsFixtureDefinition = {
  id: "empty-linear-statuses",
  workflowScopes: getFixtureWorkflowScopes(),
  statuses: [],
  modelCatalog: [],
  warnings: ["Fixture simulates an empty Linear status catalog."],
};
