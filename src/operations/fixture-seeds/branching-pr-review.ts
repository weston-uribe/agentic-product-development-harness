import type { OperationsFixtureSeedInput } from "../fixture-definition.js";
import type { OperationsWorkflowDraft } from "../types.js";
import { buildBasicCurrentWorkflowSeed } from "./basic-current-workflow.js";
import {
  buildBranchingWorkflowLayout,
  buildFixtureDraftShell,
  buildFixturePhaseModelSettings,
} from "./helpers.js";

export function buildBranchingPrReviewSeed(
  input: OperationsFixtureSeedInput,
): OperationsWorkflowDraft {
  if (input.scope.id !== "harness-repo") {
    return buildBasicCurrentWorkflowSeed(input);
  }

  return buildFixtureDraftShell({
    draftId: `draft-fixture-branching-${input.scope.id}`,
    context: input.context,
    scopeId: input.scope.id,
    baseSnapshot: input.baseSnapshot,
    layout: {
      statusPositions: buildBranchingWorkflowLayout(),
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
    phaseModelSettings: buildFixturePhaseModelSettings(input.modelCatalog),
  });
}
