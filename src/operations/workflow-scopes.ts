import { createHash } from "node:crypto";
import type { HarnessConfig } from "../config/types.js";
import type { OperationsWorkflowScope } from "./types.js";

const GITHUB_REPO_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/?$/;

export function parseOwnerRepoFromTargetUrl(targetRepo: string): string {
  const match = targetRepo.match(GITHUB_REPO_PATTERN);
  if (match?.[1]) {
    return match[1];
  }
  return targetRepo;
}

/** Derive a filesystem-safe filename from a validated scope id. Never pass raw URLs or query values. */
export function deriveSafeScopeFilename(validatedScopeId: string): string {
  return createHash("sha256")
    .update(validatedScopeId, "utf8")
    .digest("hex")
    .slice(0, 32);
}

export function buildLiveWorkflowScopes(config: HarnessConfig): OperationsWorkflowScope[] {
  return config.repos.map((repo) => ({
    id: repo.id,
    targetRepo: parseOwnerRepoFromTargetUrl(repo.targetRepo),
    linearTeams: repo.linearTeams?.length ? [...repo.linearTeams] : undefined,
    linearProjects: repo.linearProjects?.length ? [...repo.linearProjects] : undefined,
  }));
}

export function resolveScopeAllowlist(
  scopes: OperationsWorkflowScope[],
): Map<string, OperationsWorkflowScope> {
  return new Map(scopes.map((scope) => [scope.id, scope]));
}

export function validateRequestedScopeId(
  requestedScopeId: string | undefined | null,
  allowlist: Map<string, OperationsWorkflowScope>,
): { scope: OperationsWorkflowScope | undefined; error?: string } {
  if (!requestedScopeId?.trim()) {
    if (allowlist.size === 1) {
      const only = [...allowlist.values()][0];
      return { scope: only };
    }
    if (allowlist.size === 0) {
      return { scope: undefined, error: "No workflow repository scopes are configured." };
    }
    const first = [...allowlist.values()][0];
    return { scope: first };
  }

  const scope = allowlist.get(requestedScopeId.trim());
  if (!scope) {
    return {
      scope: undefined,
      error: `Unknown workflow scope: ${requestedScopeId.trim()}`,
    };
  }
  return { scope };
}

export function scopeStorageKey(input: {
  fixtureId?: string;
  scopeId: string;
}): string {
  if (input.fixtureId) {
    return `${input.fixtureId}::${input.scopeId}`;
  }
  return input.scopeId;
}
