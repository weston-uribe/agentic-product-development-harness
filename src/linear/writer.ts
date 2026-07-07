import { LinearClient } from "@linear/sdk";
import type { LinearIssueSnapshot } from "./client.js";
import { resolveWorkflowStateId } from "./states.js";
import {
  formatHarnessCommentFooter,
  formatImplementationComment,
  formatPlanningComment,
  type HarnessCommentFooterInput,
  type ImplementationCommentFooterInput,
} from "./comments.js";

export interface LinearCommentRecord {
  id: string;
  body: string;
  createdAt?: string;
}

export async function listIssueComments(
  client: LinearClient,
  issueId: string,
): Promise<LinearCommentRecord[]> {
  const issue = await client.issue(issueId);
  if (!issue) {
    throw new Error(`Linear issue not found: ${issueId}`);
  }
  const connection = await issue.comments();
  return (connection.nodes ?? []).map((comment) => ({
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt?.toISOString(),
  }));
}

export async function transitionIssueStatus(
  client: LinearClient,
  issue: LinearIssueSnapshot,
  statusName: string,
): Promise<void> {
  if (!issue.teamId) {
    throw new Error(`Issue ${issue.identifier} is missing teamId`);
  }
  const stateId = await resolveWorkflowStateId(
    client,
    issue.teamId,
    statusName,
  );
  const linearIssue = await client.issue(issue.id);
  if (!linearIssue) {
    throw new Error(`Linear issue not found: ${issue.id}`);
  }
  const payload = await linearIssue.update({ stateId });
  if (!payload.success) {
    throw new Error(`Failed to transition issue to ${statusName}`);
  }
}

export async function postIssueComment(
  client: LinearClient,
  issueId: string,
  body: string,
): Promise<string> {
  const payload = await client.createComment({ issueId, body });
  if (!payload.success) {
    throw new Error("Failed to create Linear comment");
  }
  const comment = await payload.comment;
  return comment?.id ?? "unknown";
}

export async function postPlanningComment(
  client: LinearClient,
  issueId: string,
  planBody: string,
  footer: HarnessCommentFooterInput,
): Promise<string> {
  const body = formatPlanningComment(planBody, footer);
  return postIssueComment(client, issueId, body);
}

export async function postImplementationComment(
  client: LinearClient,
  issueId: string,
  summaryBody: string,
  footer: ImplementationCommentFooterInput,
): Promise<string> {
  const body = formatImplementationComment(summaryBody, footer);
  return postIssueComment(client, issueId, body);
}

export async function postErrorComment(
  client: LinearClient,
  issueId: string,
  message: string,
  footer: ImplementationCommentFooterInput,
  phase: "planning" | "implementation" = "planning",
): Promise<string> {
  const header =
    phase === "implementation" ? "## Implementation error" : "## Harness planning error";
  const body = `${header}\n\n${message}\n\n${formatHarnessCommentFooter(footer)}`;
  return postIssueComment(client, issueId, body);
}

export function createLinearClient(apiKey: string): LinearClient {
  return new LinearClient({ apiKey });
}
