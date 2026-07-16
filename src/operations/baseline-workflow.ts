import {
  CANONICAL_WORKFLOW_FINGERPRINT,
  getDefaultCanonicalLayout,
} from "../workflow/canonical-product-development-workflow.js";
import { createCanonicalBaselineDraft } from "./draft-migration.js";
import type {
  OperationsBaseSnapshot,
  OperationsSourceContext,
  OperationsValidationIssue,
  OperationsWorkflowDraft,
} from "./types.js";

export function createLiveBaselineDraft(input: {
  context: OperationsSourceContext;
  baseSnapshot: OperationsBaseSnapshot;
  savedByRuntime: OperationsWorkflowDraft["savedByRuntime"];
  baselineWarnings?: OperationsValidationIssue[];
}): OperationsWorkflowDraft {
  return createCanonicalBaselineDraft({
    baseSnapshot: {
      ...input.baseSnapshot,
      workflowFingerprint: CANONICAL_WORKFLOW_FINGERPRINT,
    },
    sourceMode: input.context.mode,
    savedByRuntime: input.savedByRuntime,
    layout: {
      statusPositions: getDefaultCanonicalLayout(),
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  });
}

export { CANONICAL_WORKFLOW_FINGERPRINT };
