import { loadConfig } from "../config/load-config.js";
import { fetchLinearIssue } from "../linear/client.js";
import { parseIssueDescription } from "../linear/parser.js";
import { resolveTargetRepo } from "../resolver/target-repo.js";
import { inferPhaseFromStatus } from "./phase-infer.js";
import type { RunPhase } from "../types/run.js";

export type ResolveRoutePhaseArg =
  | "auto"
  | "planning"
  | "implementation"
  | "handoff"
  | "revision"
  | "merge";

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

  return {
    issueKey,
    phase,
    repoConfigId: resolved.repoConfigId,
    baseBranch: resolved.baseBranch,
    targetRepo: resolved.targetRepo,
    linearStatus: issue.status,
    mergeConcurrencyGroup: buildMergeConcurrencyGroup(
      resolved.repoConfigId,
      resolved.baseBranch,
    ),
    shouldRun: phase !== "none",
  };
}
