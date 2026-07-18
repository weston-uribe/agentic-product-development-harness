import type { FinalOutcome } from "../types/run.js";

export const EVALUATION_SCHEMA_VERSION = 1 as const;
export const EVALUATION_CAPTURE_PROFILE = "metadata-v1" as const;
export const EVALUATION_PROVIDER_LANGFUSE = "langfuse" as const;

export type EvaluationCaptureProfile = typeof EVALUATION_CAPTURE_PROFILE;
export type EvaluationProviderName = typeof EVALUATION_PROVIDER_LANGFUSE;

export interface EvaluationCorrelation {
  schemaVersion: typeof EVALUATION_SCHEMA_VERSION;
  provider: EvaluationProviderName;
  captureProfile: EvaluationCaptureProfile;
  sessionId: string;
  traceId: string;
}

export type ObservationKind = "span" | "event" | "agent";

export interface PhaseFinishSummary {
  finalOutcome: FinalOutcome;
  errorClassification: string | null;
  linearStatusAfter: string | null;
  prCreated: boolean;
  previewAvailable: boolean;
  changedFileCount: number | null;
}

export interface NestedObservationHandle {
  update(metadata?: Record<string, unknown>): void;
  end(metadata?: Record<string, unknown>): void;
}

export interface PhaseTraceHandle {
  readonly correlation: EvaluationCorrelation;
  startChild(name: string, kind?: ObservationKind): NestedObservationHandle;
  finish(
    summary: PhaseFinishSummary,
    metadata?: Record<string, unknown>,
  ): void;
}

export interface StartPhaseTraceInput {
  phase: "implementation" | "handoff";
  issueKey: string;
  runId: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluationRuntime {
  readonly enabled: boolean;
  startPhaseTrace(input: StartPhaseTraceInput): Promise<PhaseTraceHandle | null>;
  flushAndShutdown(): Promise<void>;
}

export interface EvaluationRuntimeConfig {
  provider: EvaluationProviderName;
  captureProfile: EvaluationCaptureProfile;
  namespace: string;
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  tracingEnvironment: string;
  release: string | null;
}
