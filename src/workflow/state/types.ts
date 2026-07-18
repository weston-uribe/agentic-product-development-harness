/**
 * Authoritative issue-scoped workflow state.
 * Markers, manifests, and status comments may snapshot this record but must not advance it.
 */

import type { ReviewDecision } from "../review-contracts.js";

export const WORKFLOW_STATE_RECORD_KIND = "p-dev.workflow-state.v1" as const;

export interface AcceptedReviewDecision {
  decision: ReviewDecision;
  decisionIdentity: string;
  phaseId: string;
  acceptedAt: string;
}

export interface WorkflowStateRecord {
  kind: typeof WORKFLOW_STATE_RECORD_KIND;
  issueKey: string;
  workflowSchemaVersion: string;
  /** Monotonic CAS token. */
  stateRevision: number;
  currentPhaseExecutionId: string | null;
  currentPhaseId: string | null;
  enabledOptionalPhases: Record<string, boolean>;
  cycleCounters: Record<string, number>;
  lastAcceptedReviewDecision: AcceptedReviewDecision | null;
  returnDestination: string | null;
  activeRunIdentities: string[];
  completedPhaseIdentities: string[];
  supersededGenerationIdentities: string[];
  lastTransitionIdentity: string | null;
  lastTransitionAt: string | null;
}

/** Immutable snapshot reference stored on manifests/comments. */
export interface WorkflowStateSnapshotRef {
  workflowSchemaVersion: string;
  stateRevision: number;
  lastTransitionIdentity: string | null;
  issueKey: string;
}

export function createEmptyWorkflowState(input: {
  issueKey: string;
  workflowSchemaVersion: string;
  enabledOptionalPhases?: Record<string, boolean>;
}): WorkflowStateRecord {
  return {
    kind: WORKFLOW_STATE_RECORD_KIND,
    issueKey: input.issueKey,
    workflowSchemaVersion: input.workflowSchemaVersion,
    stateRevision: 0,
    currentPhaseExecutionId: null,
    currentPhaseId: null,
    enabledOptionalPhases: input.enabledOptionalPhases ?? {
      planReview: false,
      codeReview: false,
    },
    cycleCounters: {
      plan_review_cycles: 0,
      code_review_cycles: 0,
    },
    lastAcceptedReviewDecision: null,
    returnDestination: null,
    activeRunIdentities: [],
    completedPhaseIdentities: [],
    supersededGenerationIdentities: [],
    lastTransitionIdentity: null,
    lastTransitionAt: null,
  };
}

export function toSnapshotRef(
  state: WorkflowStateRecord,
): WorkflowStateSnapshotRef {
  return {
    workflowSchemaVersion: state.workflowSchemaVersion,
    stateRevision: state.stateRevision,
    lastTransitionIdentity: state.lastTransitionIdentity,
    issueKey: state.issueKey,
  };
}
