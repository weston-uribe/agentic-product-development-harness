export type RunPhase =
  | "planning"
  | "implementation"
  | "handoff"
  | "revision"
  | "merge"
  | "production_sync"
  | "none";

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
  | "missing_planning_comment"
  | "validation_failed"
  | "pr_not_created"
  | "branch_without_pr"
  | "wrong_target_repo"
  | "wrong_pr_target"
  | "base_branch_missing"
  | "wrong_pr_base_branch"
  | "github_auth_failure"
  | "github_api_failure"
  | "missing_implementation_marker"
  | "missing_implementation_pr"
  | "missing_merge_metadata"
  | "production_not_promoted"
  | "missing_pr_url"
  | "pr_closed"
  | "preview_not_found"
  | "checks_failing"
  | "missing_handoff_marker"
  | "missing_pm_feedback"
  | "missing_branch"
  | "revision_pr_mismatch"
  | "cursor_branch_attach_failure"
  | "missing_merge_source_marker"
  | "pr_already_merged"
  | "checks_pending"
  | "checks_unknown"
  | "github_merge_failure"
  | "deployment_not_found"
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
  branch: string | null;
  prUrl: string | null;
  previewUrl: string | null;
  validationSummary: string | null;
  changedFiles: string[] | null;
  checkSummary: string | null;
  previousImplementationRunId: string | null;
  previousHandoffRunId: string | null;
  pmFeedbackCommentId: string | null;
  previousRevisionRunId: string | null;
  mergeCommitSha: string | null;
  mergeMethod: string | null;
  mergedAt: string | null;
  deploymentUrl: string | null;
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
  | "planning_comment_loaded"
  | "implementation_comment_loaded"
  | "linear_status_changed"
  | "linear_comment_posted"
  | "phase_start_comment_posted"
  | "cursor_agent_created"
  | "cursor_event"
  | "cursor_run_poll_fallback"
  | "cursor_run_finished"
  | "cursor_run_cancelled"
  | "cursor_cancel_unavailable"
  | "cursor_run_cancel_failed"
  | "git_result_captured"
  | "pr_captured"
  | "validation_completed"
  | "github_pr_inspected"
  | "preview_poll_started"
  | "preview_captured"
  | "preview_not_found"
  | "handoff_comment_posted"
  | "handoff_comment_loaded"
  | "pm_feedback_loaded"
  | "revision_comment_posted"
  | "revision_pr_validated"
  | "merge_source_comment_loaded"
  | "merge_checks_evaluated"
  | "github_pr_marked_ready"
  | "github_merge_requested"
  | "github_merge_completed"
  | "deployment_poll_started"
  | "deployment_poll_skipped"
  | "deployment_captured"
  | "deployment_not_found"
  | "merge_comment_posted"
  | "merge_recovery_written"
  | "run_finished";

export interface RunEvent {
  ts: string;
  level: "info" | "warn" | "error";
  event: RunEventName;
  data?: Record<string, unknown>;
}
