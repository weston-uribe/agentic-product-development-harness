import type { OperationsFixtureSeedInput } from "../fixture-definition.js";
import type { OperationsWorkflowDraft } from "../types.js";
import {
  buildBasicWorkflowLayout,
  buildFixtureDraftShell,
  buildFixturePhaseModelSettings,
} from "./helpers.js";

export function buildBasicCurrentWorkflowSeed(
  input: OperationsFixtureSeedInput,
): OperationsWorkflowDraft {
  return buildFixtureDraftShell({
    draftId: `draft-fixture-basic-${input.scope.id}`,
    context: input.context,
    scopeId: input.scope.id,
    baseSnapshot: input.baseSnapshot,
    layout: {
      statusPositions: buildBasicWorkflowLayout(),
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
    phaseModelSettings: buildFixturePhaseModelSettings(input.modelCatalog),
  });
}
