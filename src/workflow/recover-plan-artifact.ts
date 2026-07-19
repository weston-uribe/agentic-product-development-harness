/**
 * Recover immutable plan artifact identity from durable Linear planning comments
 * when issue-scoped workflow-state.json is absent (ephemeral GHA runners).
 */

import { createHash } from "node:crypto";
import { parseHarnessMarkers } from "../linear/markers.js";
import {
  createPlanArtifactIdentity,
  hashPlanArtifactBody,
  type PlanArtifactIdentity,
} from "./plan-artifact.js";

export interface LinearCommentLike {
  body: string;
  createdAt?: string;
}

export function extractFullPlanBody(commentBody: string): string | null {
  const match = commentBody.match(
    /### Full plan\n([\s\S]*?)(?:\n<!--|\n---\n\*Harness|\s*$)/,
  );
  const body = match?.[1]?.trim();
  return body && body.length > 0 ? body : null;
}

/**
 * Prefer marker-backed identity when present; otherwise derive a stable identity
 * from planner run_id + plan body hash so Plan Review can correlate across jobs.
 */
export function recoverPlanArtifactFromPlanningComments(input: {
  comments: readonly LinearCommentLike[];
  orchestratorMarker: string;
  promptContractVersionFallback?: string;
}): PlanArtifactIdentity | null {
  const planning = input.comments
    .slice()
    .reverse()
    .map((c) => ({
      body: c.body,
      markers: parseHarnessMarkers(c.body),
      createdAt: c.createdAt,
    }))
    .find(
      (c) =>
        c.markers.orchestratorMarker === input.orchestratorMarker &&
        c.markers.phase === "planning" &&
        Boolean(c.markers.runId) &&
        c.body.includes("### Full plan"),
    );

  if (!planning?.markers.runId) return null;

  const planBody = extractFullPlanBody(planning.body);
  if (!planBody) return null;

  const planArtifactHash =
    planning.markers.planArtifactHash ?? hashPlanArtifactBody(planBody);
  const markerGeneration = planning.markers.planGenerationId;
  const planGenerationId =
    markerGeneration && markerGeneration.trim().length > 0
      ? markerGeneration.trim()
      : `plan-recovered-${createHash("sha256")
          .update(`${planning.markers.runId}:${planArtifactHash}`)
          .digest("hex")
          .slice(0, 32)}`;

  return createPlanArtifactIdentity({
    planBody,
    plannerRunId: planning.markers.runId,
    promptContractVersion:
      planning.markers.promptVersion ??
      input.promptContractVersionFallback ??
      "planning@1",
    workflowStateRevision: 1,
    createdAt: planning.createdAt,
    planGenerationId,
  });
}
