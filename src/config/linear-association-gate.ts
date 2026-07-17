import type { HarnessConfig } from "./types.js";
import type { ErrorClassification } from "../types/run.js";
import {
  assertLinearAssociationConfigured,
  hasLinearAssociationsInConfig,
  resolveLinearAssociationForIssue,
} from "./resolve-linear-workspace.js";

export type LinearAssociationGateResult =
  | { ok: true }
  | {
      ok: false;
      code: "linear_team_project_not_configured";
      message: string;
      errorClassification: ErrorClassification;
    };

export function runLinearAssociationGate(input: {
  config: HarnessConfig;
  teamId?: string | null;
  projectId?: string | null;
}): LinearAssociationGateResult {
  if (!hasLinearAssociationsInConfig(input.config)) {
    return { ok: true };
  }

  const teamId = input.teamId?.trim();
  const projectId = input.projectId?.trim();

  if (!teamId || !projectId) {
    return {
      ok: false,
      code: "linear_team_project_not_configured",
      message:
        "linear_team_project_not_configured: issue teamId and projectId are required when linearAssociations are configured",
      errorClassification: "linear_team_project_not_configured",
    };
  }

  const result = assertLinearAssociationConfigured(input.config, {
    teamId,
    projectId,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: `${result.code}: no harness association matches team ${teamId} and project ${projectId}`,
      errorClassification: result.code,
    };
  }

  return { ok: true };
}

export function resolveAssociationTargetRepo(input: {
  config: HarnessConfig;
  teamId?: string | null;
  projectId?: string | null;
}): ReturnType<typeof resolveLinearAssociationForIssue> {
  const teamId = input.teamId?.trim();
  const projectId = input.projectId?.trim();
  if (!teamId || !projectId) {
    return null;
  }
  return resolveLinearAssociationForIssue(input.config, { teamId, projectId });
}
