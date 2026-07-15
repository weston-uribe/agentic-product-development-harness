import type { OperationsFixtureSeedInput } from "../fixture-definition.js";
import type { OperationsRule, OperationsWorkflowDraft } from "../types.js";
import { buildBasicCurrentWorkflowSeed } from "./basic-current-workflow.js";
import {
  FIXTURE_STATUS_IDS,
  buildCursorModelSelection,
  buildOutcome,
  buildBasicWorkflowLayout,
} from "./helpers.js";

export function buildBranchingPrReviewSeed(
  input: OperationsFixtureSeedInput,
): OperationsWorkflowDraft {
  const base = buildBasicCurrentWorkflowSeed(input);
  const modelSelection = buildCursorModelSelection(input.modelCatalog, "composer-2.5", {
    fast: "false",
  });

  const prReviewRule: OperationsRule = {
    id: "rule-fixture-pr-review",
    sourceStatusId: FIXTURE_STATUS_IDS.engReview,
    enabled: true,
    executorId: "pr-review-agent",
    modelSelection,
    outcomes: [
      buildOutcome("outcome-fixture-pr-approved", "Approved", FIXTURE_STATUS_IDS.readyMerge),
      buildOutcome(
        "outcome-fixture-pr-changes",
        "Changes requested",
        FIXTURE_STATUS_IDS.needsRevision,
      ),
      buildOutcome(
        "outcome-fixture-pr-unable",
        "Unable to proceed",
        FIXTURE_STATUS_IDS.blocked,
      ),
    ],
  };

  const rules = base.rules.map((rule) => {
    if (rule.id !== "rule-fixture-pm-review") {
      return rule;
    }
    return {
      ...rule,
      outcomes: rule.outcomes.map((outcome) =>
        outcome.id === "outcome-fixture-pm-approved"
          ? { ...outcome, destinationStatusId: FIXTURE_STATUS_IDS.engReview }
          : outcome,
      ),
    };
  });

  const statusIdsOnCanvas = base.statusIdsOnCanvas.includes(
    FIXTURE_STATUS_IDS.engReview,
  )
    ? base.statusIdsOnCanvas
    : [...base.statusIdsOnCanvas, FIXTURE_STATUS_IDS.engReview];

  return {
    ...base,
    draftId: "draft-fixture-branching-pr-review",
    statusIdsOnCanvas,
    rules: [...rules, prReviewRule],
    layout: {
      ...base.layout,
      statusPositions: buildBasicWorkflowLayout(),
    },
  };
}
