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
  productionBranch: string;
  repoConfigId: string;
  previewProvider: string;
  integrationPreviewUrl?: string;
  productionUrl?: string;
  integrationSuccessStatus?: string;
  productionSuccessStatus?: string;
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
      productionBranch: mapping?.productionBranch ?? "main",
      repoConfigId: mapping?.id ?? "explicit",
      previewProvider: mapping?.previewProvider ?? "none",
      integrationPreviewUrl: mapping?.integrationPreviewUrl,
      productionUrl: mapping?.productionUrl,
      integrationSuccessStatus: mapping?.integrationSuccessStatus,
      productionSuccessStatus: mapping?.productionSuccessStatus,
      resolutionSource: "explicit",
    };
  }

  const byProject = findByProject(context.projectName, config);
  if (byProject) {
    assertRepoAllowed(byProject.targetRepo, config);
    return {
      targetRepo: normalizeRepoUrl(byProject.targetRepo),
      baseBranch: byProject.baseBranch,
      productionBranch: byProject.productionBranch,
      repoConfigId: byProject.id,
      previewProvider: byProject.previewProvider ?? "none",
      integrationPreviewUrl: byProject.integrationPreviewUrl,
      productionUrl: byProject.productionUrl,
      integrationSuccessStatus: byProject.integrationSuccessStatus,
      productionSuccessStatus: byProject.productionSuccessStatus,
      resolutionSource: "project",
    };
  }

  const byTeam = findByTeam(context.teamName, config);
  if (byTeam) {
    assertRepoAllowed(byTeam.targetRepo, config);
    return {
      targetRepo: normalizeRepoUrl(byTeam.targetRepo),
      baseBranch: byTeam.baseBranch,
      productionBranch: byTeam.productionBranch,
      repoConfigId: byTeam.id,
      previewProvider: byTeam.previewProvider ?? "none",
      integrationPreviewUrl: byTeam.integrationPreviewUrl,
      productionUrl: byTeam.productionUrl,
      integrationSuccessStatus: byTeam.integrationSuccessStatus,
      productionSuccessStatus: byTeam.productionSuccessStatus,
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
