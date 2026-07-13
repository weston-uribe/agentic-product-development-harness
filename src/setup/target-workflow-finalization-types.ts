export type WorkflowInstallLifecycle =
  | "preparing"
  | "pr-created"
  | "pr-updated"
  | "waiting-for-checks"
  | "updating-branch"
  | "merging"
  | "verifying"
  | "complete"
  | "blocked";

export type WorkflowInstallBlockedCategory =
  | "checks-pending"
  | "checks-failing"
  | "mergeability-pending"
  | "branch-behind"
  | "review-required"
  | "permission-denied"
  | "merge-conflict"
  | "unexpected-pr-content"
  | "merge-queue-required"
  | "merge-api-failure"
  | "verification-failed";

export interface TargetWorkflowFinalizationResult {
  repoConfigId: string;
  targetRepo: string;
  targetRepoSlug: string;
  productionBranch: string;
  branchName: string;
  lifecycle: WorkflowInstallLifecycle;
  blockedCategory?: WorkflowInstallBlockedCategory;
  message: string;
  prUrl?: string;
  prNumber?: number;
  validatedHeadSha?: string;
  workflowStatus: "present" | "missing" | "differs" | "unknown";
  canRetry: boolean;
  requiresGitHubIntervention: boolean;
  advancedThisRequest: boolean;
  lockContended: boolean;
}

export interface TargetWorkflowFinalizeInput {
  repoConfigId: string;
  targetRepo: string;
  productionBranch: string;
  manualHarnessDispatchRepo?: string;
  prUrl?: string;
  branchName?: string;
}

export const WORKFLOW_INSTALL_CHECK_POLL_TIMEOUT_MS = 120_000;
export const WORKFLOW_INSTALL_VERIFICATION_TIMEOUT_MS = 60_000;
export const WORKFLOW_INSTALL_SHORT_POLL_INTERVAL_MS = 2_000;
