import type { HarnessConfig } from "../config/types.js";
import type { LinearIssueSnapshot } from "../linear/client.js";
import type { LinearCommentRecord } from "../linear/writer.js";
import { hasPlanningCompletionMarker } from "../linear/comments.js";
import {
  getEligiblePlanningStatuses,
  getTransitionalStatus,
} from "../config/status-names.js";

export interface IdempotencyResult {
  skip: boolean;
  reason?: string;
}

export function checkPlanningIdempotency(
  config: HarnessConfig,
  issue: LinearIssueSnapshot,
  comments: LinearCommentRecord[],
  force: boolean,
): IdempotencyResult {
  if (force) {
    return { skip: false };
  }

  const orchestratorMarker = config.orchestratorMarker;
  const readyForBuild = getTransitionalStatus(config, "readyForBuild");
  const planningInProgress = getTransitionalStatus(config, "planningInProgress");
  const eligiblePlanning = getEligiblePlanningStatuses(config).map((s) =>
    s.toLowerCase(),
  );

  const currentStatus = issue.status?.toLowerCase() ?? "";
  const hasPlanningComment = comments.some((comment) =>
    hasPlanningCompletionMarker(comment.body, orchestratorMarker),
  );

  if (hasPlanningComment && currentStatus === readyForBuild.toLowerCase()) {
    return {
      skip: true,
      reason: "duplicate_phase_completed: planning comment already exists",
    };
  }

  if (
    hasPlanningComment &&
    !eligiblePlanning.includes(currentStatus) &&
    currentStatus !== planningInProgress.toLowerCase()
  ) {
    return {
      skip: true,
      reason: "duplicate_phase_completed: planning marker found on issue",
    };
  }

  return { skip: false };
}

export function assertPlanningEligibleStatus(
  config: HarnessConfig,
  issue: LinearIssueSnapshot,
  force: boolean,
): void {
  const status = issue.status?.trim() ?? "";
  const eligible = getEligiblePlanningStatuses(config);
  const planningInProgress = getTransitionalStatus(config, "planningInProgress");

  if (eligible.some((s) => s.toLowerCase() === status.toLowerCase())) {
    return;
  }

  if (force && status.toLowerCase() === planningInProgress.toLowerCase()) {
    return;
  }

  throw new Error(
    `wrong_status: issue is "${status}"; expected one of: ${eligible.join(", ")}`,
  );
}
