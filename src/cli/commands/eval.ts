import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  appendAnnotation,
  buildAnnotationBundle,
  buildLangfuseAnnotationExport,
  computeAnnotationCoverage,
  computeDatasetReadiness,
  isPrimaryReviewSubject,
  readAnnotations,
  validateAnnotationsStore,
  writeAnnotationBundle,
  writeAnnotationCoverage,
  writeDatasetReadiness,
} from "../../evaluation/annotations/index.js";
import type { AnnotationInput } from "../../evaluation/annotations/types.js";
import { deriveEvaluationSessionId } from "../../evaluation/subjects/ids.js";
import { extractEvaluationSubjects } from "../../evaluation/subjects/extract.js";
import { readSubjects } from "../../evaluation/subjects/writer.js";
import { EXIT_CONFIG, EXIT_SUCCESS } from "../exit-codes.js";
import {
  resolveEvaluationDirectory,
  resolveLogDirectory,
  resolveNamespace,
} from "./eval-shared.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function runEvalSubjects(options: {
  configPath?: string;
  logDirectory?: string;
  issueKey: string;
  runDirectory?: string;
  namespace?: string;
  json?: boolean;
}): Promise<number> {
  try {
    const logDirectory = await resolveLogDirectory(options);
    const namespace = resolveNamespace(options.namespace);
    const result = await extractEvaluationSubjects({
      logDirectory,
      issueKey: options.issueKey,
      namespace,
      runDirectory: options.runDirectory
        ? path.resolve(options.runDirectory)
        : undefined,
    });
    if (options.json) {
      printJson({
        evaluationDirectory: result.evaluationDirectory,
        subjectCount: result.subjects.length,
        report: result.report,
      });
    } else {
      console.log(`Extracted ${result.subjects.length} subjects`);
      console.log(`Store: ${result.evaluationDirectory}`);
      console.log(
        `Report: ${path.join(result.evaluationDirectory, "subject-extraction-report.json")}`,
      );
      for (const [type, count] of Object.entries(
        result.report.subjectsEmittedByType,
      )) {
        console.log(`- ${type}: ${count}`);
      }
    }
    return EXIT_SUCCESS;
  } catch (error) {
    console.error(
      `eval subjects failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_CONFIG;
  }
}

export async function runEvalSubjectsList(options: {
  configPath?: string;
  logDirectory?: string;
  issueKey: string;
  namespace?: string;
  json?: boolean;
}): Promise<number> {
  try {
    const logDirectory = await resolveLogDirectory(options);
    const evaluationDirectory = resolveEvaluationDirectory(
      logDirectory,
      options.issueKey,
    );
    const subjects = await readSubjects(evaluationDirectory);
    const eligible = subjects.filter(isPrimaryReviewSubject);
    if (options.json) {
      printJson(eligible);
    } else {
      console.log(`${eligible.length} annotation-eligible subjects`);
      for (const subject of eligible) {
        console.log(
          `- ${subject.subjectType} ${subject.phase ?? "-"} ${subject.evaluationSubjectId} run=${subject.harnessRunId ?? "-"} evidenceComplete=${subject.evidenceComplete}`,
        );
      }
    }
    return EXIT_SUCCESS;
  } catch (error) {
    console.error(
      `eval subjects-list failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_CONFIG;
  }
}

export async function runEvalAnnotationBundle(options: {
  configPath?: string;
  logDirectory?: string;
  issueKey: string;
  subjectId: string;
  runDirectory?: string;
  includePreviews?: boolean;
  json?: boolean;
}): Promise<number> {
  try {
    const logDirectory = await resolveLogDirectory(options);
    const evaluationDirectory = resolveEvaluationDirectory(
      logDirectory,
      options.issueKey,
    );
    const bundle = await buildAnnotationBundle({
      evaluationDirectory,
      evaluationSubjectId: options.subjectId,
      includePreviews: options.includePreviews === true,
      runDirectory: options.runDirectory
        ? path.resolve(options.runDirectory)
        : undefined,
    });
    const filePath = await writeAnnotationBundle(evaluationDirectory, bundle);
    if (options.json) {
      printJson({ filePath, bundle });
    } else {
      console.log(`Wrote annotation bundle: ${filePath}`);
      console.log(`Scope: ${bundle.scope}`);
      console.log(`Rubrics: ${bundle.rubrics.length}`);
      console.log(
        `Missing required evidence: ${bundle.missingRequiredEvidence.join(", ") || "none"}`,
      );
    }
    return EXIT_SUCCESS;
  } catch (error) {
    console.error(
      `eval annotation-bundle failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_CONFIG;
  }
}

export async function runEvalAnnotate(options: {
  configPath?: string;
  logDirectory?: string;
  issueKey: string;
  inputPath: string;
  json?: boolean;
}): Promise<number> {
  try {
    const logDirectory = await resolveLogDirectory(options);
    const evaluationDirectory = resolveEvaluationDirectory(
      logDirectory,
      options.issueKey,
    );
    const raw = await readFile(path.resolve(options.inputPath), "utf8");
    const input = JSON.parse(raw) as AnnotationInput;
    const result = await appendAnnotation({ evaluationDirectory, input });
    if (options.json) {
      printJson(result);
    } else {
      console.log(
        result.reusedExisting
          ? `Reused existing annotation ${result.annotation.annotationId}`
          : `Appended annotation ${result.annotation.annotationId}`,
      );
    }
    return EXIT_SUCCESS;
  } catch (error) {
    console.error(
      `eval annotate failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_CONFIG;
  }
}

export async function runEvalAnnotationValidate(options: {
  configPath?: string;
  logDirectory?: string;
  issueKey: string;
  json?: boolean;
}): Promise<number> {
  try {
    const logDirectory = await resolveLogDirectory(options);
    const evaluationDirectory = resolveEvaluationDirectory(
      logDirectory,
      options.issueKey,
    );
    const result = await validateAnnotationsStore(evaluationDirectory);
    if (options.json) {
      printJson(result);
    } else if (result.ok) {
      console.log("Annotations store is valid");
    } else {
      console.error("Annotations store validation failed:");
      for (const error of result.errors) console.error(`- ${error}`);
    }
    return result.ok ? EXIT_SUCCESS : EXIT_CONFIG;
  } catch (error) {
    console.error(
      `eval annotation-validate failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_CONFIG;
  }
}

export async function runEvalAnnotationCoverage(options: {
  configPath?: string;
  logDirectory?: string;
  issueKey: string;
  namespace?: string;
  json?: boolean;
}): Promise<number> {
  try {
    const logDirectory = await resolveLogDirectory(options);
    const namespace = resolveNamespace(options.namespace);
    const evaluationDirectory = resolveEvaluationDirectory(
      logDirectory,
      options.issueKey,
    );
    const evaluationSessionId = deriveEvaluationSessionId(
      namespace,
      options.issueKey,
    );
    const coverage = await computeAnnotationCoverage({
      evaluationDirectory,
      evaluationSessionId,
      issueKey: options.issueKey,
    });
    const filePath = await writeAnnotationCoverage(
      evaluationDirectory,
      coverage,
    );
    if (options.json) {
      printJson({ filePath, coverage });
    } else {
      console.log(`Wrote coverage: ${filePath}`);
      console.log(
        `Eligible=${coverage.eligibleSubjects} annotated=${coverage.annotatedSubjects} complete=${coverage.completeRubricCoverage} partial=${coverage.partialRubricCoverage}`,
      );
      console.log(
        `scored=${coverage.scoredDimensions} insufficient_evidence=${coverage.insufficientEvidenceDimensions} not_applicable=${coverage.notApplicableDimensions} missing=${coverage.missingDimensions}`,
      );
    }
    return EXIT_SUCCESS;
  } catch (error) {
    console.error(
      `eval annotation-coverage failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_CONFIG;
  }
}

export async function runEvalDatasetReadiness(options: {
  configPath?: string;
  logDirectory?: string;
  issueKey: string;
  namespace?: string;
  json?: boolean;
}): Promise<number> {
  try {
    const logDirectory = await resolveLogDirectory(options);
    const namespace = resolveNamespace(options.namespace);
    const evaluationDirectory = resolveEvaluationDirectory(
      logDirectory,
      options.issueKey,
    );
    const readiness = await computeDatasetReadiness({
      evaluationDirectory,
      issueKey: options.issueKey,
      namespace,
    });
    const filePath = await writeDatasetReadiness(
      evaluationDirectory,
      readiness,
    );
    const eligibleCount = readiness.subjects.filter(
      (s) => s.datasetEligible,
    ).length;
    if (options.json) {
      printJson({ filePath, readiness });
    } else {
      console.log(`Wrote dataset readiness: ${filePath}`);
      console.log(
        `Subjects=${readiness.subjects.length} datasetEligible=${eligibleCount}`,
      );
    }
    return EXIT_SUCCESS;
  } catch (error) {
    console.error(
      `eval dataset-readiness failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_CONFIG;
  }
}

export async function runEvalAnnotationExport(options: {
  configPath?: string;
  logDirectory?: string;
  issueKey: string;
  namespace?: string;
  outputPath?: string;
  json?: boolean;
}): Promise<number> {
  try {
    const logDirectory = await resolveLogDirectory(options);
    const namespace = resolveNamespace(options.namespace);
    const evaluationDirectory = resolveEvaluationDirectory(
      logDirectory,
      options.issueKey,
    );
    const evaluationSessionId = deriveEvaluationSessionId(
      namespace,
      options.issueKey,
    );
    const subjects = await readSubjects(evaluationDirectory);
    const annotations = await readAnnotations(evaluationDirectory);
    const subjectLookup = new Map(
      subjects.map((subject) => [
        subject.evaluationSubjectId,
        {
          subjectType: subject.subjectType,
          langfuseSessionId: subject.evaluationSessionId,
          langfuseTraceId: null as string | null,
          langfuseObservationId: null as string | null,
        },
      ]),
    );
    const artifact = buildLangfuseAnnotationExport({
      issueKey: options.issueKey,
      evaluationSessionId,
      annotations,
      subjectLookup,
    });
    const outputPath = path.resolve(
      options.outputPath ??
        path.join(evaluationDirectory, "annotation-export-langfuse.json"),
    );
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    if (options.json) {
      printJson({ outputPath, artifact });
    } else {
      console.log(`Wrote Langfuse annotation export: ${outputPath}`);
      console.log(`Records: ${artifact.records.length}`);
    }
    return EXIT_SUCCESS;
  } catch (error) {
    console.error(
      `eval annotation-export failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT_CONFIG;
  }
}
