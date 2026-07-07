import type { HarnessConfig } from "../config/types.js";
import type { LinearIssueSnapshot } from "../linear/client.js";
import type { LinearCommentRecord } from "../linear/writer.js";
import {
  hasHandoffCompletionMarker,
  hasImplementationCompletionMarker,
  hasPlanningCompletionMarker,
} from "../linear/comments.js";
import { parseHarnessMarkers } from "../linear/markers.js";
import {
  getEligibleHandoffStatuses,
  getEligibleImplementationStatuses,
  getEligiblePlanningStatuses,
  getTransitionalStatus,
} from "../config/status-names.js";
import type { ParsedIssue } from "../types/parsed-issue.js";

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

export function checkImplementationIdempotency(
  config: HarnessConfig,
  issue: LinearIssueSnapshot,
  comments: LinearCommentRecord[],
  force: boolean,
): IdempotencyResult {
  if (force) {
    return { skip: false };
  }

  const orchestratorMarker = config.orchestratorMarker;
  const prOpen = getTransitionalStatus(config, "prOpen");
  const hasImplementationComment = comments.some((comment) =>
    hasImplementationCompletionMarker(comment.body, orchestratorMarker),
  );
  const hasPrUrlForIssue = comments.some((comment) => {
    const markers = parseHarnessMarkers(comment.body);
    return (
      markers.orchestratorMarker === orchestratorMarker &&
      markers.phase === "implementation" &&
      Boolean(markers.prUrl)
    );
  });

  if (hasImplementationComment || hasPrUrlForIssue) {
    return {
      skip: true,
      reason: "duplicate_phase_completed: implementation PR marker already exists",
    };
  }

  if (issue.status?.toLowerCase() === prOpen.toLowerCase()) {
    return {
      skip: true,
      reason: "duplicate_phase_completed: issue is already PR Open",
    };
  }

  return { skip: false };
}

export function assertImplementationEligibleStatus(
  config: HarnessConfig,
  issue: LinearIssueSnapshot,
  force: boolean,
): void {
  const status = issue.status?.trim() ?? "";
  const eligible = getEligibleImplementationStatuses(config);
  const building = getTransitionalStatus(config, "buildingInProgress");

  if (eligible.some((s) => s.toLowerCase() === status.toLowerCase())) {
    return;
  }

  if (force && status.toLowerCase() === building.toLowerCase()) {
    return;
  }

  throw new Error(
    `wrong_status: issue is "${status}"; expected one of: ${eligible.join(", ")}`,
  );
}

export function isNarrowImplementationIssue(parsed: ParsedIssue): boolean {
  return parsed.task.length <= 240 && parsed.acceptanceCriteria.length <= 7;
}

export function checkHandoffIdempotency(
  config: HarnessConfig,
  issue: LinearIssueSnapshot,
  comments: LinearCommentRecord[],
  force: boolean,
): IdempotencyResult {
  if (force) {
    return { skip: false };
  }

  const orchestratorMarker = config.orchestratorMarker;
  const pmReview = getTransitionalStatus(config, "pmReview");
  const hasHandoffComment = comments.some((comment) =>
    hasHandoffCompletionMarker(comment.body, orchestratorMarker),
  );

  if (hasHandoffComment) {
    return {
      skip: true,
      reason: "duplicate_phase_completed: handoff marker already exists",
    };
  }

  if (
    issue.status?.toLowerCase() === pmReview.toLowerCase() &&
    hasHandoffComment
  ) {
    return {
      skip: true,
      reason: "duplicate_phase_completed: issue already in PM Review with handoff",
    };
  }

  return { skip: false };
}

export function assertHandoffEligibleStatus(
  config: HarnessConfig,
  issue: LinearIssueSnapshot,
  force: boolean,
): void {
  const status = issue.status?.trim() ?? "";
  const eligible = getEligibleHandoffStatuses(config);
  const prOpen = getTransitionalStatus(config, "prOpen");

  if (eligible.some((s) => s.toLowerCase() === status.toLowerCase())) {
    return;
  }

  if (force && status.toLowerCase() === prOpen.toLowerCase()) {
    return;
  }

  throw new Error(
    `wrong_status: issue is "${status}"; expected one of: ${eligible.join(", ")}`,
  );
}
