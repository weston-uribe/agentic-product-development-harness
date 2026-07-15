import type { OperationsFixtureId } from "../constants.js";
import { basicCurrentWorkflowFixture } from "./basic-current-workflow.js";
import { branchingPrReviewFixture } from "./branching-pr-review.js";
import { emptyLinearStatusesFixture } from "./empty-linear-statuses.js";
import { credentialErrorsFixture } from "./credential-errors.js";
import { hundredNodePerformanceFixture } from "./hundred-node-performance.js";
import type { OperationsFixtureDefinition } from "../fixture-definition.js";

const FIXTURES: Record<OperationsFixtureId, OperationsFixtureDefinition> = {
  "basic-current-workflow": basicCurrentWorkflowFixture,
  "branching-pr-review": branchingPrReviewFixture,
  "empty-linear-statuses": emptyLinearStatusesFixture,
  "credential-errors": credentialErrorsFixture,
  "hundred-node-performance": hundredNodePerformanceFixture,
};

export function getFixtureDefinition(
  fixtureId: OperationsFixtureId,
): OperationsFixtureDefinition {
  return FIXTURES[fixtureId];
}

export function listFixtureDefinitions(): OperationsFixtureDefinition[] {
  return Object.values(FIXTURES);
}

export type { OperationsFixtureDefinition } from "../fixture-definition.js";
