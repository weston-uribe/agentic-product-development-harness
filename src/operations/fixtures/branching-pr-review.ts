import type { OperationsFixtureDefinition } from "../fixture-definition.js";
import { basicCurrentWorkflowFixture } from "./basic-current-workflow.js";

export const branchingPrReviewFixture: OperationsFixtureDefinition = {
  ...basicCurrentWorkflowFixture,
  id: "branching-pr-review",
  warnings: [
    "Fixture includes a planned PR Review Agent with branching outcomes for prototype testing.",
  ],
};
