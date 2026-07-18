import { mkdir, writeFile } from "node:fs/promises";
import { getDatasetReadinessPath } from "../../artifacts/paths.js";
import { listRubricsForSubject } from "../rubrics/load.js";
import { deriveEvaluationSessionId } from "../subjects/ids.js";
import { readSubjects } from "../subjects/writer.js";
import { getEffectiveSubmittedAnnotation } from "./effective.js";
import { isPrimaryReviewSubject } from "./coverage.js";
import { readAnnotations } from "./store.js";
import type {
  DatasetReadinessArtifact,
  DatasetReadinessRecord,
  PrivacyReviewStatus,
} from "./types.js";
import { DATASET_READINESS_POLICY_VERSION } from "./types.js";

function dimensionComplete(params: {
  judgmentStatus: string | undefined;
  notApplicableSatisfiesCompletion?: boolean;
}): boolean {
  if (params.judgmentStatus === "scored") return true;
  if (
    params.judgmentStatus === "not_applicable" &&
    params.notApplicableSatisfiesCompletion
  ) {
    return true;
  }
  return false;
}

export async function computeDatasetReadiness(params: {
  evaluationDirectory: string;
  issueKey: string;
  namespace?: string;
  privacyReviewBySubjectId?: Record<string, PrivacyReviewStatus>;
  now?: () => string;
}): Promise<DatasetReadinessArtifact> {
  const now = params.now ?? (() => new Date().toISOString());
  const computedAt = now();
  const namespace =
    params.namespace ?? process.env.P_DEV_EVALUATION_NAMESPACE ?? "default";
  const evaluationSessionId = deriveEvaluationSessionId(
    namespace,
    params.issueKey,
  );
  const subjects = await readSubjects(params.evaluationDirectory);
  const annotations = await readAnnotations(params.evaluationDirectory);

  const records: DatasetReadinessRecord[] = [];
  for (const subject of subjects) {
    const reasons: string[] = [];
    const evidenceComplete = subject.evidenceComplete;
    if (!evidenceComplete) reasons.push("evidence_incomplete");

    const privacyReviewStatus =
      params.privacyReviewBySubjectId?.[subject.evaluationSubjectId] ??
      "not_reviewed";
    if (privacyReviewStatus !== "approved") {
      reasons.push(`privacy_${privacyReviewStatus}`);
    }

    let humanAnnotationComplete = false;
    let requiredRubricsComplete = false;
    let hasPreferredOutput = false;

    if (isPrimaryReviewSubject(subject)) {
      const rubrics = await listRubricsForSubject({
        subjectType: subject.subjectType,
        phase: subject.phase,
      });
      if (rubrics.length === 0) {
        reasons.push("no_applicable_rubrics");
      } else {
        let allRubricsComplete = true;
        let allDimensionsAnnotated = true;
        for (const rubric of rubrics) {
          let rubricComplete = true;
          for (const dimension of rubric.dimensions) {
            const effective = getEffectiveSubmittedAnnotation(annotations, {
              evaluationSubjectId: subject.evaluationSubjectId,
              rubricId: rubric.rubricId,
              rubricVersion: rubric.rubricVersion,
              dimensionId: dimension.dimensionId,
            });
            if (!effective) {
              allDimensionsAnnotated = false;
              rubricComplete = false;
              continue;
            }
            if (effective.correctedOutputArtifactRef) {
              hasPreferredOutput = true;
            }
            if (
              !dimensionComplete({
                judgmentStatus: effective.judgmentStatus,
                notApplicableSatisfiesCompletion:
                  dimension.notApplicableSatisfiesCompletion,
              })
            ) {
              rubricComplete = false;
            }
          }
          if (!rubricComplete) allRubricsComplete = false;
        }
        humanAnnotationComplete = allDimensionsAnnotated;
        requiredRubricsComplete = allRubricsComplete;
        if (!humanAnnotationComplete) {
          reasons.push("human_annotation_incomplete");
        }
        if (!requiredRubricsComplete) {
          reasons.push("required_rubrics_incomplete");
        }
      }
    } else {
      // Non-primary subjects are never dataset-eligible in v1.
      reasons.push("subject_type_not_dataset_primary");
    }

    // Default false until all explicit requirements are satisfied.
    const datasetEligible =
      evidenceComplete &&
      humanAnnotationComplete &&
      requiredRubricsComplete &&
      privacyReviewStatus === "approved" &&
      isPrimaryReviewSubject(subject);

    if (!datasetEligible && reasons.length === 0) {
      reasons.push("dataset_eligible_default_false");
    }

    records.push({
      evaluationSubjectId: subject.evaluationSubjectId,
      evidenceComplete,
      humanAnnotationComplete,
      requiredRubricsComplete,
      hasPreferredOutput,
      privacyReviewStatus,
      datasetEligible,
      datasetIneligibilityReasons: datasetEligible ? [] : reasons,
      computedAt,
      readinessPolicyVersion: DATASET_READINESS_POLICY_VERSION,
    });
  }

  return {
    schemaVersion: 1,
    readinessPolicyVersion: DATASET_READINESS_POLICY_VERSION,
    evaluationSessionId,
    issueKey: params.issueKey,
    computedAt,
    subjects: records,
  };
}

export async function writeDatasetReadiness(
  evaluationDirectory: string,
  artifact: DatasetReadinessArtifact,
): Promise<string> {
  await mkdir(evaluationDirectory, { recursive: true });
  const filePath = getDatasetReadinessPath(evaluationDirectory);
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return filePath;
}
