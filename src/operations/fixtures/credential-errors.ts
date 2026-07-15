import type { OperationsFixtureDefinition } from "../fixture-definition.js";
import { buildCatalogUnavailableEntry } from "../model-catalog-utils.js";

export const credentialErrorsFixture: OperationsFixtureDefinition = {
  id: "credential-errors",
  statuses: [],
  modelCatalog: buildCatalogUnavailableEntry("fixture"),
  warnings: [
    "Fixture simulates missing or failed Linear/Cursor credential reads.",
  ],
};
