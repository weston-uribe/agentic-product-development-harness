import type { RunManifest } from "../types/run.js";
import type {
  EvaluationCorrelation,
  EvaluationRuntime,
  PhaseFinishSummary,
  PhaseTraceHandle,
} from "./types.js";
import { buildMetadataV1 } from "./capture-policy.js";

export function phaseFinishFromManifest(
  manifest: Pick<
    RunManifest,
    | "finalOutcome"
    | "errorClassification"
    | "linearStatusAfter"
    | "prUrl"
    | "previewUrl"
    | "changedFiles"
  >,
): PhaseFinishSummary {
  return {
    finalOutcome: manifest.finalOutcome,
    errorClassification: manifest.errorClassification,
    linearStatusAfter: manifest.linearStatusAfter,
    prCreated: Boolean(manifest.prUrl),
    previewAvailable: Boolean(manifest.previewUrl),
    changedFileCount: Array.isArray(manifest.changedFiles)
      ? manifest.changedFiles.length
      : null,
  };
}

export function finishPhaseTrace(
  handle: PhaseTraceHandle | null | undefined,
  manifest: RunManifest,
  extraMetadata?: Record<string, unknown>,
): EvaluationCorrelation | null {
  if (!handle) {
    return null;
  }
  try {
    handle.finish(phaseFinishFromManifest(manifest), extraMetadata);
    return handle.correlation;
  } catch {
    return handle.correlation;
  }
}

export function withEvaluationCorrelation(
  manifest: RunManifest,
  correlation: EvaluationCorrelation | null,
): RunManifest {
  return {
    ...manifest,
    evaluation: correlation,
  };
}

/** Shared env-derived allowlisted fields for phase traces. */
export function commonEnvMetadata(): Record<string, unknown> {
  return buildMetadataV1({
    githubActionsRunId: process.env.GITHUB_RUN_ID ?? null,
    githubWorkflowName: process.env.GITHUB_WORKFLOW ?? null,
    triggerType: process.env.TRIGGER ?? process.env.GITHUB_EVENT_NAME ?? null,
    githubActionsConfigFingerprint:
      process.env.HARNESS_CONFIG_FINGERPRINT ?? null,
    harnessReleaseSha:
      process.env.LANGFUSE_RELEASE ?? process.env.GITHUB_SHA ?? null,
    pDevPackageVersion: process.env.P_DEV_PACKAGE_VERSION ?? null,
    runGeneration: process.env.P_DEV_RUN_GENERATION
      ? Number(process.env.P_DEV_RUN_GENERATION)
      : null,
  });
}

export async function safeStartPhaseTrace(
  runtime: EvaluationRuntime | null | undefined,
  input: {
    phase: "implementation" | "handoff";
    issueKey: string;
    runId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<PhaseTraceHandle | null> {
  if (!runtime) return null;
  try {
    return await runtime.startPhaseTrace({
      ...input,
      metadata: {
        ...commonEnvMetadata(),
        ...(input.metadata ?? {}),
      },
    });
  } catch {
    return null;
  }
}
