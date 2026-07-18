import type { ArtifactRef } from "../telemetry/types.js";

export const ANNOTATION_SCHEMA_VERSION = 1 as const;
export const DATASET_READINESS_POLICY_VERSION = "dataset-readiness-v1" as const;
export const ANNOTATION_COVERAGE_SCHEMA_VERSION = 1 as const;

export type HumanAnnotationSource = "human_local" | "human_langfuse";

export type AnnotationWrittenStatus = "draft" | "submitted";

export type JudgmentStatus =
  | "scored"
  | "insufficient_evidence"
  | "not_applicable";

export type AnnotationValue = string | number | boolean;

export interface HumanAnnotation {
  annotationSchemaVersion: typeof ANNOTATION_SCHEMA_VERSION;
  annotationId: string;
  evaluationSubjectId: string;
  rubricId: string;
  rubricVersion: string;
  dimensionId: string;
  judgmentStatus: JudgmentStatus;
  /** Required only when judgmentStatus === "scored". */
  value?: AnnotationValue;
  reviewerRole: string;
  /** Opaque reviewer identifier — never name/email as required identity. */
  reviewerId?: string;
  confidence: number;
  reviewerComment?: string;
  correctedOutputArtifactRef?: ArtifactRef;
  evidenceReviewed: string[];
  createdAt: string;
  supersedesAnnotationId?: string;
  invalidatesAnnotationId?: string;
  source: HumanAnnotationSource;
  status: AnnotationWrittenStatus;
  /** Optional client-supplied request id for idempotent retries. */
  clientRequestId?: string;
  idempotencyKey?: string;
}

export interface AnnotationInput {
  evaluationSubjectId: string;
  rubricId: string;
  rubricVersion: string;
  dimensionId: string;
  judgmentStatus: JudgmentStatus;
  value?: AnnotationValue;
  reviewerRole: string;
  reviewerId?: string;
  confidence: number;
  reviewerComment?: string;
  /** Inline corrected output — stored as artifact ref, not unbounded inline. */
  correctedOutput?: string;
  correctedOutputArtifactRef?: ArtifactRef;
  evidenceReviewed: string[];
  supersedesAnnotationId?: string;
  invalidatesAnnotationId?: string;
  source?: HumanAnnotationSource;
  status: AnnotationWrittenStatus;
  clientRequestId?: string;
  /** Preserve imported Langfuse annotation IDs when reconciling. */
  preserveAnnotationId?: string;
}

export type PrivacyReviewStatus =
  | "not_reviewed"
  | "approved"
  | "rejected"
  | "needs_redaction";

export interface DatasetReadinessRecord {
  evaluationSubjectId: string;
  evidenceComplete: boolean;
  humanAnnotationComplete: boolean;
  requiredRubricsComplete: boolean;
  hasPreferredOutput: boolean;
  privacyReviewStatus: PrivacyReviewStatus;
  datasetEligible: boolean;
  datasetIneligibilityReasons: string[];
  computedAt: string;
  readinessPolicyVersion: typeof DATASET_READINESS_POLICY_VERSION;
}

export interface DatasetReadinessArtifact {
  schemaVersion: 1;
  readinessPolicyVersion: typeof DATASET_READINESS_POLICY_VERSION;
  evaluationSessionId: string;
  issueKey: string;
  computedAt: string;
  subjects: DatasetReadinessRecord[];
}

export interface DimensionCoverageState {
  dimensionId: string;
  state: "scored" | "insufficient_evidence" | "not_applicable" | "missing";
  annotationId?: string;
  satisfiesCompletion: boolean;
}

export interface SubjectRubricCoverage {
  evaluationSubjectId: string;
  subjectType: string;
  phase: string | null;
  rubricId: string;
  rubricVersion: string;
  dimensions: DimensionCoverageState[];
  complete: boolean;
  partial: boolean;
}

export interface AnnotationCoverageArtifact {
  schemaVersion: typeof ANNOTATION_COVERAGE_SCHEMA_VERSION;
  evaluationSessionId: string;
  issueKey: string;
  computedAt: string;
  subjectsByType: Record<string, number>;
  subjectsByPhase: Record<string, number>;
  eligibleSubjects: number;
  annotatedSubjects: number;
  completeRubricCoverage: number;
  partialRubricCoverage: number;
  missingRequiredDimensions: number;
  scoredDimensions: number;
  insufficientEvidenceDimensions: number;
  notApplicableDimensions: number;
  missingDimensions: number;
  supersededAnnotationCount: number;
  invalidatedAnnotationCount: number;
  draftAnnotationCount: number;
  coverageByRubricVersion: Record<
    string,
    { complete: number; partial: number; missing: number }
  >;
  subjectRubrics: SubjectRubricCoverage[];
}
