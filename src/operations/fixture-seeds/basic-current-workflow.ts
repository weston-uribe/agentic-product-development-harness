import type { OperationsFixtureSeedInput } from "../fixture-definition.js";
import type { OperationsWorkflowDraft } from "../types.js";
import {
  FIXTURE_STATUS_IDS,
  buildBasicWorkflowLayout,
  buildBasicWorkflowRules,
  buildFixtureDraftShell,
} from "./helpers.js";

export function buildBasicCurrentWorkflowSeed(
  input: OperationsFixtureSeedInput,
): OperationsWorkflowDraft {
  const canvasIds = [
    FIXTURE_STATUS_IDS.readyPlanning,
    FIXTURE_STATUS_IDS.readyBuild,
    FIXTURE_STATUS_IDS.prOpen,
    FIXTURE_STATUS_IDS.pmReview,
    FIXTURE_STATUS_IDS.needsRevision,
    FIXTURE_STATUS_IDS.readyMerge,
    FIXTURE_STATUS_IDS.blocked,
    FIXTURE_STATUS_IDS.mergedDev,
  ];

  return buildFixtureDraftShell({
    draftId: "draft-fixture-basic-current-workflow",
    context: input.context,
    baseSnapshot: input.baseSnapshot,
    statusIdsOnCanvas: canvasIds,
    rules: buildBasicWorkflowRules(input.modelCatalog),
    layout: {
      statusPositions: buildBasicWorkflowLayout(),
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  });
}
