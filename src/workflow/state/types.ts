/**
 * Authoritative issue-scoped workflow state.
 * Markers, manifests, and status comments may snapshot this record but must not advance it.
 */

import type { ReviewDecision } from "../review-contracts.js";
import type { PlanArtifactIdentity } from "../plan-artifact.js";

export const WORKFLOW_STATE_RECORD_KIND = "p-dev.workflow-state.v1" as const;

export interface AcceptedReviewDecision {
  decision: ReviewDecision;
  decisionIdentity: string;
  phaseId: string;
  acceptedAt: string;
  reviewedPlanGenerationId?: string;
  reviewedPlanArtifactHash?: string;
  findings?: Array<{
    id: string;
    severity: "blocking" | "non_blocking";
    category: string;
    evidence: string;
    requiredChange?: string;
  }>;
}

/** Frozen configuration/readiness captured at phase claim time. */
export interface PhaseExecutionFreeze {
  phaseId: string;
  claimedAt: string;
  requestedEnabled: boolean;
  /** Fail-closed readiness at claim — not merely the config toggle. */
  effectiveEnabled: boolean;
  cycleLimit: number;
  planReviewerModelId: string | null;
  planReviewerFast: boolean | null;
  missingRequirementCodes: string[];
  workflowSchemaVersion: string;
}

export interface WorkflowStateRecord {
  kind: typeof WORKFLOW_STATE_RECORD_KIND;
  issueKey: string;
  workflowSchemaVersion: string;
  /** Monotonic CAS token. */
  stateRevision: number;
  currentPhaseExecutionId: string | null;
  currentPhaseId: string | null;
  /** Requested optional-phase toggles from config (not necessarily effective). */
  enabledOptionalPhases: Record<string, boolean>;
  /** Effective optional-phase activation after readiness (fail-closed). */
  effectiveOptionalPhases: Record<string, boolean>;
  cycleCounters: Record<string, number>;
  lastAcceptedReviewDecision: AcceptedReviewDecision | null;
  returnDestination: string | null;
  activeRunIdentities: string[];
  completedPhaseIdentities: string[];
  supersededGenerationIdentities: string[];
  lastTransitionIdentity: string | null;
  lastTransitionAt: string | null;
  latestPlanArtifact: PlanArtifactIdentity | null;
  phaseExecutionFreeze: PhaseExecutionFreeze | null;
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
  effectiveOptionalPhases?: Record<string, boolean>;
}): WorkflowStateRecord {
  const requested = input.enabledOptionalPhases ?? {
    planReview: false,
    codeReview: false,
  };
  return {
    kind: WORKFLOW_STATE_RECORD_KIND,
    issueKey: input.issueKey,
    workflowSchemaVersion: input.workflowSchemaVersion,
    stateRevision: 0,
    currentPhaseExecutionId: null,
    currentPhaseId: null,
    enabledOptionalPhases: requested,
    effectiveOptionalPhases: input.effectiveOptionalPhases ?? {
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
    latestPlanArtifact: null,
    phaseExecutionFreeze: null,
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
