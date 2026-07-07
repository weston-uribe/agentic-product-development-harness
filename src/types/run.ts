export type RunPhase = "planning" | "implementation" | "none";

export type FinalOutcome = "success" | "failed" | "skipped" | "duplicate";

export type ErrorClassification =
  | "ambiguous_issue"
  | "missing_target_repo"
  | "unknown_repo_denied"
  | null;

export interface RunManifest {
  runId: string;
  issueKey: string;
  phase: RunPhase;
  phaseInferredFromStatus: string | null;
  targetRepo: string | null;
  baseBranch: string | null;
  resolutionSource: "explicit" | "project" | "team" | null;
  dryRun: boolean;
  finalOutcome: FinalOutcome;
  errorClassification: ErrorClassification;
  startedAt: string;
  finishedAt: string;
  milestone: string;
  cursorAgentId: string | null;
  cursorRunId: string | null;
  prUrl: string | null;
  previewUrl: string | null;
  model: string | null;
}

export type RunEventName =
  | "run_started"
  | "config_loaded"
  | "issue_fetched"
  | "issue_loaded_from_fixture"
  | "issue_parsed"
  | "repo_resolved"
  | "repo_resolution_failed"
  | "phase_inferred"
  | "run_finished";

export interface RunEvent {
  ts: string;
  level: "info" | "warn" | "error";
  event: RunEventName;
  data?: Record<string, unknown>;
}
