export interface LinearWebhookHeaders {
  signature: string | null;
  deliveryId: string | null;
  eventType: string | null;
  timestamp: string | null;
}

export interface ParsedLinearIssueWebhook {
  issueKey: string | null;
  issueId: string | null;
  issueUrl: string | null;
  teamId: string | null;
  projectId: string | null;
  action: string;
  statusName: string | null;
  previousStatusName: string | null;
  statusChanged: boolean;
  linearDeliveryId: string | null;
  linearWebhookId: string | null;
  actorSummary: string | null;
  eventType: string;
}

export type WebhookIgnoreReason =
  | "ignored_event"
  | "ignored_status"
  | "missing_issue_key"
  | "linear_team_project_not_configured";

export interface WebhookAcceptedResponse {
  accepted: true;
  dispatched: true;
  issueKey: string;
}

export interface WebhookIgnoredResponse {
  accepted: false;
  reason: WebhookIgnoreReason;
}

export interface WebhookErrorResponse {
  error:
    | "method_not_allowed"
    | "invalid_signature"
    | "timestamp_out_of_tolerance"
    | "dispatch_failed";
}

export interface RepositoryDispatchPayload {
  issueKey: string;
  issueId: string | null;
  issueUrl: string | null;
  action: string;
  statusName: string | null;
  previousStatusName: string | null;
  linearDeliveryId: string | null;
  linearWebhookId: string | null;
  receivedAt: string;
}

export interface ProductionPromotedDispatchPayload {
  repo: string;
  productionBranch: string;
  sourceRepo: string;
  after: string;
  ref: string;
  receivedAt: string;
  githubRunId?: string;
  githubDeliveryId?: string;
}

export interface DispatchGitHubOptions {
  token: string;
  repository: string;
  eventType: string;
  clientPayload: RepositoryDispatchPayload | ProductionPromotedDispatchPayload;
  fetchImpl?: typeof fetch;
}
