export const GITHUB_WORKFLOW_SCOPE_SETUP_ERROR =
  "GitHub token lacks the workflow scope required to create or update Actions workflow files under .github/workflows/. Use a classic PAT with the workflow scope or a fine-grained PAT with Actions/workflows write permission on the target repo, then update GITHUB_TOKEN in .env.local.";

export const GITHUB_CLASSIC_PAT_MISSING_WORKFLOW_MESSAGE =
  "GitHub token is valid, but it cannot update workflow files. Create a classic PAT with repo + workflow, or a fine-grained PAT with Contents write + Workflows write for the target repo.";

export const GITHUB_TOKEN_GUIDED_HELPER_TEXT =
  "Must read target repos, write encrypted harness repo secrets later (Step 4), and create or update workflow install PRs in target repos (Step 5). Classic PAT: repo + workflow. Fine-grained PAT: Contents write + Workflows write on each target repo.";

export const GITHUB_FINE_GRAINED_STEP1_LIMITATION =
  "Fine-grained PAT detected. Repo-specific workflow install permission will be checked in Step 2 for each target repo.";

export const GITHUB_STEP5_WORKFLOW_PERMISSION_FALLBACK_PREFIX =
  "An earlier setup check did not catch this permission gap. GitHub sometimes only reveals workflow write limits when updating files under .github/workflows/. ";

export type GitHubTokenType = "classic" | "fine-grained" | "unknown";

export interface GitHubTokenMetadata {
  login: string;
  tokenType: GitHubTokenType;
  oauthScopes: string[];
  hasWorkflowScope: boolean;
  hasRepoScope: boolean;
}

export function parseOAuthScopes(headerValue: string | null): string[] {
  if (!headerValue?.trim()) {
    return [];
  }

  return headerValue
    .split(",")
    .map((scope) => scope.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveGitHubTokenType(
  tokenTypeHeader: string | null,
  oauthScopes: readonly string[],
): GitHubTokenType {
  const normalized = tokenTypeHeader?.trim().toLowerCase();
  if (normalized === "fine-grained") {
    return "fine-grained";
  }
  if (normalized === "classic" || oauthScopes.length > 0) {
    return "classic";
  }
  return "unknown";
}

export function classicPatHasWorkflowScope(oauthScopes: readonly string[]): boolean {
  return oauthScopes.includes("workflow");
}

export function classicPatHasRepoScope(oauthScopes: readonly string[]): boolean {
  return oauthScopes.includes("repo") || oauthScopes.includes("public_repo");
}

export function assessClassicPatGuidedCapabilities(
  metadata: GitHubTokenMetadata,
): { ok: true; limitation?: string } | { ok: false; message: string } {
  if (metadata.tokenType !== "classic") {
    return { ok: true, limitation: GITHUB_FINE_GRAINED_STEP1_LIMITATION };
  }

  if (!classicPatHasRepoScope(metadata.oauthScopes)) {
    return {
      ok: false,
      message:
        "GitHub token is valid, but it lacks the repo scope needed to read private target repos and write harness repo secrets. Create a classic PAT with repo + workflow.",
    };
  }

  if (!metadata.hasWorkflowScope) {
    return {
      ok: false,
      message: GITHUB_CLASSIC_PAT_MISSING_WORKFLOW_MESSAGE,
    };
  }

  return { ok: true };
}

/**
 * Fine-grained PAT workflow-write cannot be proven without attempting a write.
 * Step 2 uses repo metadata plus read-only Actions endpoints as a best-effort check.
 */
export const FINE_GRAINED_WORKFLOW_WRITE_LIMITATION =
  "GitHub does not expose fine-grained Workflows write permission through a dedicated read-only API. Step 2 confirms repo access and Actions visibility; Step 5 remains the final fallback if GitHub only reveals the limit on write.";
