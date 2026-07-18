import type { EvaluationSubjectPhase, EvaluationSubjectType } from "../subjects/types.js";

export type RubricResponseType =
  | "boolean"
  | "numeric"
  | "categorical"
  | "ordinal"
  | "free_text";

export interface RubricScoreAnchor {
  value: string | number | boolean;
  label: string;
  definition: string;
}

export interface RubricDimension {
  dimensionId: string;
  name: string;
  description: string;
  responseType: RubricResponseType;
  /** Ordered values for ordinal/categorical scales. */
  allowedValues?: Array<string | number | boolean>;
  numericMin?: number;
  numericMax?: number;
  anchors: RubricScoreAnchor[];
  requiredEvidence: string[];
  optionalEvidence: string[];
  allowCorrectedOutput: boolean;
  reviewerCommentRequired: boolean;
  /** When true, not_applicable judgments count toward rubric completion. */
  notApplicableSatisfiesCompletion?: boolean;
  /** Comment required when judgmentStatus is insufficient_evidence or not_applicable. */
  unscoredCommentRequired?: boolean;
}

export interface EvaluationRubric {
  rubricId: string;
  rubricVersion: string;
  name: string;
  description: string;
  applicableSubjectTypes: EvaluationSubjectType[];
  applicablePhases: EvaluationSubjectPhase[] | null;
  dimensions: RubricDimension[];
  deprecated?: boolean;
  replacedByRubricId?: string | null;
  replacedByRubricVersion?: string | null;
}
