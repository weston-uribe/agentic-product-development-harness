import type { OperationsFixtureDefinition } from "../fixture-definition.js";
import { basicCurrentWorkflowFixture } from "./basic-current-workflow.js";
import { buildBranchingPrReviewSeed } from "../fixture-seeds/branching-pr-review.js";

export const branchingPrReviewFixture: OperationsFixtureDefinition = {
  ...basicCurrentWorkflowFixture,
  id: "branching-pr-review",
  warnings: [
    "Fixture includes a planned PR Review Agent with branching outcomes.",
    ...basicCurrentWorkflowFixture.warnings,
  ],
  buildSeedDraft: buildBranchingPrReviewSeed,
};
