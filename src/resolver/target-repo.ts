import type { HarnessConfig } from "../config/types.js";
import type { ParsedIssue } from "../types/parsed-issue.js";
import { ResolverError } from "./errors.js";
import { assertRepoAllowed } from "./allowed-repos.js";
import { normalizeRepoUrl } from "./normalize-repo.js";

export interface IssueContext {
  projectName?: string;
  teamName?: string;
}

export interface ResolvedTarget {
  targetRepo: string;
  baseBranch: string;
  repoConfigId: string;
  previewProvider: string;
  resolutionSource: "explicit" | "project" | "team";
}

export function resolveTargetRepo(
  parsed: ParsedIssue,
  context: IssueContext,
  config: HarnessConfig,
): ResolvedTarget {
  if (parsed.parseErrors.length > 0) {
    throw new ResolverError(
      "ambiguous_issue",
      `Issue parse errors: ${parsed.parseErrors.join(", ")}`,
    );
  }

  if (parsed.targetRepoRaw) {
    const targetRepo = normalizeRepoUrl(parsed.targetRepoRaw);
    assertRepoAllowed(targetRepo, config);
    const mapping = findRepoMappingByUrl(targetRepo, config);
    return {
      targetRepo,
      baseBranch: mapping?.baseBranch ?? "main",
      repoConfigId: mapping?.id ?? "explicit",
      previewProvider: mapping?.previewProvider ?? "none",
      resolutionSource: "explicit",
    };
  }

  const byProject = findByProject(context.projectName, config);
  if (byProject) {
    assertRepoAllowed(byProject.targetRepo, config);
    return {
      targetRepo: normalizeRepoUrl(byProject.targetRepo),
      baseBranch: byProject.baseBranch,
      repoConfigId: byProject.id,
      previewProvider: byProject.previewProvider ?? "none",
      resolutionSource: "project",
    };
  }

  const byTeam = findByTeam(context.teamName, config);
  if (byTeam) {
    assertRepoAllowed(byTeam.targetRepo, config);
    return {
      targetRepo: normalizeRepoUrl(byTeam.targetRepo),
      baseBranch: byTeam.baseBranch,
      repoConfigId: byTeam.id,
      previewProvider: byTeam.previewProvider ?? "none",
      resolutionSource: "team",
    };
  }

  throw new ResolverError(
    "missing_target_repo",
    "No target repo found in issue description and no Linear project/team mapping matched",
  );
}

function findRepoMappingByUrl(targetRepo: string, config: HarnessConfig) {
  const normalized = normalizeRepoUrl(targetRepo);
  return config.repos.find(
    (repo) => normalizeRepoUrl(repo.targetRepo) === normalized,
  );
}

function findByProject(projectName: string | undefined, config: HarnessConfig) {
  if (!projectName) return undefined;
  return config.repos.find((repo) =>
    repo.linearProjects?.some(
      (name) => name.toLowerCase() === projectName.toLowerCase(),
    ),
  );
}

function findByTeam(teamName: string | undefined, config: HarnessConfig) {
  if (!teamName) return undefined;
  return config.repos.find((repo) =>
    repo.linearTeams?.some(
      (name) => name.toLowerCase() === teamName.toLowerCase(),
    ),
  );
}
