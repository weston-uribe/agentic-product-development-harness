import type { ArtifactRef } from "../telemetry/types.js";
import type { AnnotationValue } from "../annotations/types.js";

/**
 * Deterministic evaluator / future LLM-judge result contract.
 * Distinct from HumanAnnotation — never stored as annotation source.
 */

export type EvaluatorResultStatus =
  | "pass"
  | "fail"
  | "error"
  | "skipped";

export interface EvaluatorResult {
  schemaVersion: 1;
  evaluatorId: string;
  evaluatorVersion: string;
  /** Implementation hash or package version pin for reproducibility. */
  evaluatorImplementationHash: string;
  evaluationSubjectId: string;
  rubricId: string;
  rubricVersion: string;
  dimensionId: string;
  result: AnnotationValue | null;
  status: EvaluatorResultStatus;
  evidenceReferences: ArtifactRef[];
  explanation: string;
  executedAt: string;
}

export const EVALUATOR_RESULT_SCHEMA_VERSION = 1 as const;
