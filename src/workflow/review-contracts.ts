/**
 * Reusable review-loop contracts for plan/code reviewers.
 */

import { createHash } from "node:crypto";

export type ReviewDecision = "approved" | "needs_revision";

export type ReviewFindingSeverity = "blocking" | "non_blocking";

export interface ReviewFinding {
  id: string;
  severity: ReviewFindingSeverity;
  category: string;
  evidence: string;
  requiredChange?: string;
  /** @deprecated use evidence; retained for transitional callers */
  summary?: string;
  path?: string;
}

export interface PlanReviewOutcome {
  decision: ReviewDecision;
  summary: string;
  findings: ReviewFinding[];
  reviewedPlanGenerationId: string;
  reviewedPlanArtifactHash: string;
}

export interface ReviewOutcome {
  decision: ReviewDecision;
  summary: string;
  findings: ReviewFinding[];
  confidence?: number;
  /** Durable identity for duplicate/stale protection. */
  decisionIdentity: string;
  /** Reviewer generation that produced this outcome; stale generations are rejected. */
  generationId: string;
  reviewedPlanGenerationId?: string;
  reviewedPlanArtifactHash?: string;
  /** Workflow-state revision expected at review start. */
  expectedStateRevision?: number;
}

export interface ReviewLoopConfig {
  approvedPhaseId: string;
  revisionPhaseId: string;
  returnToReviewPhaseId: string;
  cycleCounter: string;
  maximumCycles: number;
  escalationPhaseId: string;
}

export type PlanReviewOutcomeValidationError =
  | "malformed_json"
  | "missing_decision"
  | "unknown_decision"
  | "missing_summary"
  | "missing_reviewed_plan_identity"
  | "approved_with_blocking_findings"
  | "needs_revision_without_blocking_findings"
  | "unknown_severity"
  | "empty_blocking_evidence"
  | "invalid_findings";

export interface PlanReviewOutcomeValidationResult {
  ok: boolean;
  outcome?: PlanReviewOutcome;
  error?: PlanReviewOutcomeValidationError;
  detail?: string;
}

const DECISIONS = new Set<ReviewDecision>(["approved", "needs_revision"]);
const SEVERITIES = new Set<ReviewFindingSeverity>(["blocking", "non_blocking"]);

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFinding(raw: unknown, index: number): ReviewFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = asNonEmptyString(row.id) ?? `finding-${index + 1}`;
  const severityRaw = asNonEmptyString(row.severity);
  if (!severityRaw || !SEVERITIES.has(severityRaw as ReviewFindingSeverity)) {
    return null;
  }
  const category = asNonEmptyString(row.category) ?? "general";
  const evidence =
    asNonEmptyString(row.evidence) ??
    asNonEmptyString(row.summary) ??
    null;
  if (!evidence) return null;
  const requiredChange = asNonEmptyString(row.requiredChange) ?? undefined;
  return {
    id,
    severity: severityRaw as ReviewFindingSeverity,
    category,
    evidence,
    ...(requiredChange ? { requiredChange } : {}),
  };
}

/**
 * Validate structured Plan Review agent output.
 * Schema/provider failure must not increment review cycles (caller uses infra_retry).
 */
export function validatePlanReviewOutcome(
  raw: unknown,
): PlanReviewOutcomeValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "malformed_json" };
  }
  const obj = raw as Record<string, unknown>;
  const decisionRaw = asNonEmptyString(obj.decision);
  if (!decisionRaw) {
    return { ok: false, error: "missing_decision" };
  }
  if (!DECISIONS.has(decisionRaw as ReviewDecision)) {
    return { ok: false, error: "unknown_decision", detail: decisionRaw };
  }
  const summary = asNonEmptyString(obj.summary);
  if (!summary) {
    return { ok: false, error: "missing_summary" };
  }
  const reviewedPlanGenerationId = asNonEmptyString(
    obj.reviewedPlanGenerationId,
  );
  const reviewedPlanArtifactHash = asNonEmptyString(
    obj.reviewedPlanArtifactHash,
  );
  if (!reviewedPlanGenerationId || !reviewedPlanArtifactHash) {
    return { ok: false, error: "missing_reviewed_plan_identity" };
  }

  if (!Array.isArray(obj.findings)) {
    return { ok: false, error: "invalid_findings" };
  }
  const findings: ReviewFinding[] = [];
  for (let i = 0; i < obj.findings.length; i += 1) {
    const finding = normalizeFinding(obj.findings[i], i);
    if (!finding) {
      const severity = (obj.findings[i] as { severity?: unknown } | undefined)
        ?.severity;
      if (
        typeof severity === "string" &&
        !SEVERITIES.has(severity as ReviewFindingSeverity)
      ) {
        return { ok: false, error: "unknown_severity", detail: severity };
      }
      return { ok: false, error: "invalid_findings", detail: `index=${i}` };
    }
    if (finding.severity === "blocking" && !finding.evidence.trim()) {
      return { ok: false, error: "empty_blocking_evidence", detail: finding.id };
    }
    findings.push(finding);
  }

  const decision = decisionRaw as ReviewDecision;
  const blocking = findings.filter((f) => f.severity === "blocking");
  if (decision === "approved" && blocking.length > 0) {
    return { ok: false, error: "approved_with_blocking_findings" };
  }
  if (decision === "needs_revision" && blocking.length === 0) {
    return { ok: false, error: "needs_revision_without_blocking_findings" };
  }

  return {
    ok: true,
    outcome: {
      decision,
      summary,
      findings,
      reviewedPlanGenerationId,
      reviewedPlanArtifactHash,
    },
  };
}

export function extractPlanReviewOutcomeFromText(
  text: string,
): PlanReviewOutcomeValidationResult {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const raw = fenced?.[1] ?? text.trim();
  try {
    return validatePlanReviewOutcome(JSON.parse(raw) as unknown);
  } catch {
    return { ok: false, error: "malformed_json" };
  }
}

export function buildReviewDecisionIdentity(input: {
  decision: ReviewDecision;
  reviewedPlanGenerationId: string;
  reviewerGenerationId: string;
}): string {
  const material = [
    input.decision,
    input.reviewedPlanGenerationId,
    input.reviewerGenerationId,
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export function toEngineReviewOutcome(input: {
  planReview: PlanReviewOutcome;
  reviewerGenerationId: string;
  expectedStateRevision?: number;
}): ReviewOutcome {
  return {
    decision: input.planReview.decision,
    summary: input.planReview.summary,
    findings: input.planReview.findings,
    decisionIdentity: buildReviewDecisionIdentity({
      decision: input.planReview.decision,
      reviewedPlanGenerationId: input.planReview.reviewedPlanGenerationId,
      reviewerGenerationId: input.reviewerGenerationId,
    }),
    generationId: input.reviewerGenerationId,
    reviewedPlanGenerationId: input.planReview.reviewedPlanGenerationId,
    reviewedPlanArtifactHash: input.planReview.reviewedPlanArtifactHash,
    expectedStateRevision: input.expectedStateRevision,
  };
}
