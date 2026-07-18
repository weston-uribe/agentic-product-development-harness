/**
 * Reusable review-loop contracts for future plan/code reviewers.
 * Reviewer prompts and agent invocation are out of scope for Chunk 4.
 */

export type ReviewDecision = "approved" | "needs_revision";

export interface ReviewFinding {
  id: string;
  severity: "info" | "warning" | "error";
  summary: string;
  path?: string;
}

export interface ReviewOutcome {
  decision: ReviewDecision;
  summary: string;
  findings: ReviewFinding[];
  confidence?: number;
  /** Durable identity for duplicate/stale protection. */
  decisionIdentity: string;
  /** Generation that produced this outcome; stale generations are rejected. */
  generationId: string;
}

export interface ReviewLoopConfig {
  approvedPhaseId: string;
  revisionPhaseId: string;
  returnToReviewPhaseId: string;
  cycleCounter: string;
  maximumCycles: number;
  escalationPhaseId: string;
}
