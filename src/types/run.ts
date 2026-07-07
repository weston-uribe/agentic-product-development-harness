export type RunPhase = "planning" | "implementation" | "none";

export type FinalOutcome = "success" | "failed" | "skipped" | "duplicate";

export type ErrorClassification =
  | "ambiguous_issue"
  | "missing_target_repo"
  | "unknown_repo_denied"
  | "wrong_status"
  | "duplicate_phase_completed"
  | "linear_auth_failure"
  | "cursor_api_failure"
  | "cursor_run_failed"
  | "cursor_run_timeout"
  | "linear_write_failure"
  | "agent_policy_violation"
  | null;

export interface RunManifest {
  runId: string;
  issueKey: string;
  phase: RunPhase;
  phaseInferredFromStatus: string | null;
  linearStatusBefore: string | null;
  linearStatusAfter: string | null;
  targetRepo: string | null;
  baseBranch: string | null;
  resolutionSource: "explicit" | "project" | "team" | null;
  dryRun: boolean;
  finalOutcome: FinalOutcome;
  errorClassification: ErrorClassification;
  startedAt: string;
  finishedAt: string;
  milestone: string;
  promptVersion: string | null;
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
  | "idempotency_skip"
  | "linear_status_changed"
  | "linear_comment_posted"
  | "cursor_agent_created"
  | "cursor_event"
  | "cursor_run_finished"
  | "run_finished";

export interface RunEvent {
  ts: string;
  level: "info" | "warn" | "error";
  event: RunEventName;
  data?: Record<string, unknown>;
}
