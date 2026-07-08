import { loadConfig } from "../config/load-config.js";
import { getTransitionalStatus } from "../config/status-names.js";
import { fetchLinearIssue } from "../linear/client.js";
import { findLatestPhaseStartRunId } from "../linear/comments.js";
import { createLinearClient, listIssueComments } from "../linear/writer.js";
import { parseIssueDescription } from "../linear/parser.js";
import { resolveTargetRepo } from "../resolver/target-repo.js";
import { GitHubClient } from "../github/client.js";
import { findImplementationPullRequest } from "../github/pr-discovery.js";
import { isImplementationStartStale } from "./building-recovery.js";
import { inferPhaseFromStatus } from "./phase-infer.js";
import type { RunPhase } from "../types/run.js";
import type { DispatchPhaseArg } from "./phase-args.js";

export type ResolveRoutePhaseArg = DispatchPhaseArg;

export interface ResolveRouteResult {
  issueKey: string;
  phase: RunPhase;
  repoConfigId: string;
  baseBranch: string;
  targetRepo: string;
  linearStatus: string | null;
  mergeConcurrencyGroup: string;
  shouldRun: boolean;
}

export function buildMergeConcurrencyGroup(
  repoConfigId: string,
  baseBranch: string,
): string {
  const sanitizedBranch = baseBranch.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${repoConfigId}-${sanitizedBranch}`;
}

function resolvePhase(
  phaseArg: ResolveRoutePhaseArg,
  inferredPhase: RunPhase,
): RunPhase {
  if (phaseArg === "auto") {
    return inferredPhase;
  }
  return phaseArg;
}

async function applyBuildingRecoveryRouting(
  issue: Awaited<ReturnType<typeof fetchLinearIssue>>,
  config: Awaited<ReturnType<typeof loadConfig>>,
  phase: RunPhase,
  targetRepo: string,
  baseBranch: string,
  linearApiKey: string,
): Promise<{ phase: RunPhase; shouldRun: boolean }> {
  const building = getTransitionalStatus(config, "buildingInProgress").toLowerCase();
  const status = issue.status?.trim().toLowerCase() ?? "";
  if (status !== building) {
    return { phase, shouldRun: phase !== "none" };
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    const github = new GitHubClient({ token: githubToken });
    const discovered = await findImplementationPullRequest(
      github,
      targetRepo,
      baseBranch,
      issue.identifier,
    );
    if (discovered) {
      return { phase: "handoff", shouldRun: true };
    }
  }

  if (phase === "implementation") {
    const client = createLinearClient(linearApiKey);
    const comments = await listIssueComments(client, issue.id);
    const latestStartRunId = findLatestPhaseStartRunId(
      comments,
      config.orchestratorMarker,
      "implementation_start",
    );
    if (latestStartRunId && !isImplementationStartStale(latestStartRunId)) {
      return { phase: "implementation", shouldRun: false };
    }

    return { phase: "implementation", shouldRun: true };
  }

  return { phase, shouldRun: phase !== "none" };
}

export interface ResolveRouteOptions {
  issueKey: string;
  configPath: string;
  phase?: ResolveRoutePhaseArg;
  linearApiKey?: string;
}

export class LinearAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearAuthError";
  }
}

export async function resolveRoute(
  options: ResolveRouteOptions,
): Promise<ResolveRouteResult> {
  const config = await loadConfig(options.configPath);
  const apiKey = options.linearApiKey ?? process.env.LINEAR_API_KEY ?? "";
  if (!apiKey) {
    throw new LinearAuthError("LINEAR_API_KEY is required");
  }

  const issueKey = options.issueKey.toUpperCase();
  const issue = await fetchLinearIssue(issueKey, apiKey);
  const parsed = parseIssueDescription(issue.description ?? "");
  const resolved = resolveTargetRepo(
    parsed,
    {
      projectName: issue.projectName ?? undefined,
      teamName: issue.teamName ?? undefined,
    },
    config,
  );

  const inferred = inferPhaseFromStatus(issue.status, config);
  const phaseArg = options.phase ?? "auto";
  const phase = resolvePhase(phaseArg, inferred.phase);

  const recovery = await applyBuildingRecoveryRouting(
    issue,
    config,
    phase,
    resolved.targetRepo,
    resolved.baseBranch,
    apiKey,
  );

  return {
    issueKey,
    phase: recovery.phase,
    repoConfigId: resolved.repoConfigId,
    baseBranch: resolved.baseBranch,
    targetRepo: resolved.targetRepo,
    linearStatus: issue.status,
    mergeConcurrencyGroup: buildMergeConcurrencyGroup(
      resolved.repoConfigId,
      resolved.baseBranch,
    ),
    shouldRun: recovery.shouldRun,
  };
}
