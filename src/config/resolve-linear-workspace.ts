import type { HarnessConfig, LinearAssociation, RepoMapping } from "./types.js";
import type {
  ControlPlaneSetupState,
  LinearWorkspaceEvidence,
} from "../setup/control-plane-types.js";

export type ResolvedLinearAssociation = LinearAssociation & {
  targetRepo: string;
  repoConfigId: string;
};

export type LinearAssociationKey = {
  workspaceId: string;
  teamId: string;
  projectId: string;
};

export function linearAssociationKey(
  association: LinearAssociationKey,
): string {
  return `${association.workspaceId}:${association.teamId}:${association.projectId}`;
}

export function resolveLinearAssociationsFromConfig(
  config: HarnessConfig,
): ResolvedLinearAssociation[] {
  const resolved: ResolvedLinearAssociation[] = [];

  for (const repo of config.repos) {
    for (const association of repo.linearAssociations ?? []) {
      resolved.push({
        ...association,
        targetRepo: repo.targetRepo,
        repoConfigId: repo.id,
      });
    }
  }

  return resolved;
}

export function resolveLinearAssociationForIssue(
  config: HarnessConfig,
  input: { workspaceId?: string; teamId: string; projectId: string },
): ResolvedLinearAssociation | null {
  const associations = resolveLinearAssociationsFromConfig(config);
  const teamId = input.teamId.trim();
  const projectId = input.projectId.trim();

  return (
    associations.find((association) => {
      if (association.teamId !== teamId || association.projectId !== projectId) {
        return false;
      }
      if (input.workspaceId?.trim()) {
        return association.workspaceId === input.workspaceId.trim();
      }
      return true;
    }) ?? null
  );
}

export type LinearAssociationAssertResult =
  | { ok: true; association: ResolvedLinearAssociation }
  | { ok: false; code: "linear_team_project_not_configured" };

export function assertLinearAssociationConfigured(
  config: HarnessConfig,
  input: { workspaceId?: string; teamId: string; projectId: string },
): LinearAssociationAssertResult {
  const association = resolveLinearAssociationForIssue(config, input);
  if (!association) {
    return { ok: false, code: "linear_team_project_not_configured" };
  }
  return { ok: true, association };
}

export type SharedProjectTargetRepoResult =
  | { ok: true }
  | {
      ok: false;
      code: "linear_project_target_repo_conflict";
      projectId: string;
      targetRepos: string[];
    };

export function assertSharedProjectTargetRepoConsistency(
  associations: Array<Pick<LinearAssociation, "projectId"> & { targetRepo: string }>,
): SharedProjectTargetRepoResult {
  const byProject = new Map<string, Set<string>>();

  for (const association of associations) {
    const existing = byProject.get(association.projectId) ?? new Set<string>();
    existing.add(association.targetRepo);
    byProject.set(association.projectId, existing);
  }

  for (const [projectId, targetRepos] of byProject.entries()) {
    if (targetRepos.size > 1) {
      return {
        ok: false,
        code: "linear_project_target_repo_conflict",
        projectId,
        targetRepos: [...targetRepos],
      };
    }
  }

  return { ok: true };
}

export function groupAssociationsByTeam(
  associations: ResolvedLinearAssociation[],
): Map<string, ResolvedLinearAssociation[]> {
  const grouped = new Map<string, ResolvedLinearAssociation[]>();
  for (const association of associations) {
    const existing = grouped.get(association.teamId) ?? [];
    existing.push(association);
    grouped.set(association.teamId, existing);
  }
  return grouped;
}

export function uniqueProjectIdsFromAssociations(
  associations: Array<Pick<LinearAssociation, "projectId">>,
): string[] {
  return [...new Set(associations.map((association) => association.projectId))];
}

export function uniqueTeamIdsFromAssociations(
  associations: Array<Pick<LinearAssociation, "teamId">>,
): string[] {
  return [...new Set(associations.map((association) => association.teamId))];
}

export function buildLinearAssociationsForRepo(input: {
  repo: RepoMapping;
  associations: LinearAssociation[];
}): LinearAssociation[] {
  return input.associations.map((association) => ({ ...association }));
}

export function hasLinearAssociationsInConfig(config: HarnessConfig): boolean {
  return config.repos.some(
    (repo) => (repo.linearAssociations?.length ?? 0) > 0,
  );
}

export function getLinearWorkspaceIdFromConfig(
  config: HarnessConfig,
): string | undefined {
  const configured = config.linear?.workspaceId?.trim();
  if (configured) {
    return configured;
  }

  const associations = resolveLinearAssociationsFromConfig(config);
  return associations[0]?.workspaceId;
}

export function evidenceFromAssociations(input: {
  workspaceId: string;
  workspaceName: string;
  associations: ResolvedLinearAssociation[];
  appliedFingerprint?: string;
  appliedAt?: string;
  migratedFromVersion?: LinearWorkspaceEvidence["migratedFromVersion"];
  migratedAt?: string;
}): LinearWorkspaceEvidence {
  const teams = new Map<
    string,
    {
      teamId: string;
      teamKey: string;
      teamName: string;
      projects: LinearWorkspaceEvidence["teams"][number]["projects"];
      lastVerifiedAt?: string;
    }
  >();

  for (const association of input.associations) {
    const team =
      teams.get(association.teamId) ??
      {
        teamId: association.teamId,
        teamKey: association.teamKey,
        teamName: association.teamKey,
        projects: [],
      };

    if (!team.projects.some((project) => project.projectId === association.projectId)) {
      team.projects.push({
        projectId: association.projectId,
        projectName: association.projectName,
        targetRepo: association.targetRepo,
        health: "verification_pending",
      });
    }

    teams.set(association.teamId, team);
  }

  return {
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    teams: [...teams.values()].map((team) => ({
      ...team,
      health: "verification_pending" as const,
    })),
    appliedFingerprint: input.appliedFingerprint,
    appliedAt: input.appliedAt,
    migratedFromVersion: input.migratedFromVersion,
    migratedAt: input.migratedAt,
  };
}

export type ConfigControlPlaneDriftFinding = {
  code:
    | "association_count_mismatch"
    | "team_id_mismatch"
    | "project_id_mismatch"
    | "workspace_id_mismatch"
    | "target_repo_mismatch";
  message: string;
  teamId?: string;
  projectId?: string;
};

export function detectConfigControlPlaneDrift(input: {
  config: HarnessConfig;
  controlPlane: ControlPlaneSetupState | null;
}): ConfigControlPlaneDriftFinding[] {
  const findings: ConfigControlPlaneDriftFinding[] = [];
  const evidence = input.controlPlane?.linearWorkspace;
  if (!evidence) {
    return findings;
  }

  const configAssociations = resolveLinearAssociationsFromConfig(input.config);
  const evidencePairs = evidence.teams.flatMap((team) =>
    team.projects.map((project) => ({
      workspaceId: evidence.workspaceId,
      teamId: team.teamId,
      projectId: project.projectId,
      targetRepo: project.targetRepo,
    })),
  );

  if (configAssociations.length !== evidencePairs.length) {
    findings.push({
      code: "association_count_mismatch",
      message: `Harness config has ${configAssociations.length} association(s) but control-plane evidence has ${evidencePairs.length}.`,
    });
  }

  const workspaceId = getLinearWorkspaceIdFromConfig(input.config);
  if (workspaceId && workspaceId !== evidence.workspaceId) {
    findings.push({
      code: "workspace_id_mismatch",
      message: `Harness config workspaceId (${workspaceId}) does not match control-plane (${evidence.workspaceId}).`,
    });
  }

  for (const configAssociation of configAssociations) {
    const evidenceMatch = evidencePairs.find(
      (pair) =>
        pair.teamId === configAssociation.teamId &&
        pair.projectId === configAssociation.projectId,
    );
    if (!evidenceMatch) {
      findings.push({
        code: "project_id_mismatch",
        message: `Association ${configAssociation.teamId}/${configAssociation.projectId} exists in harness config but not in control-plane evidence.`,
        teamId: configAssociation.teamId,
        projectId: configAssociation.projectId,
      });
      continue;
    }

    if (
      evidenceMatch.targetRepo &&
      evidenceMatch.targetRepo !== configAssociation.targetRepo
    ) {
      findings.push({
        code: "target_repo_mismatch",
        message: `Target repo for ${configAssociation.projectId} differs between harness config and control-plane evidence.`,
        teamId: configAssociation.teamId,
        projectId: configAssociation.projectId,
      });
    }
  }

  return findings;
}
