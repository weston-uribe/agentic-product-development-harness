import type { GitHubClient } from "./client.js";
import { GitHubApiError } from "./client.js";

export interface ParsedGitHubRepoUrl {
  owner: string;
  repo: string;
}

export function parseGitHubRepoUrl(repoUrl: string): ParsedGitHubRepoUrl | null {
  const match = repoUrl
    .trim()
    .match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2] };
}

export async function assertBaseBranchExists(
  client: GitHubClient,
  targetRepo: string,
  baseBranch: string,
): Promise<void> {
  const parsed = parseGitHubRepoUrl(targetRepo);
  if (!parsed) {
    throw new Error(`wrong_target_repo: Invalid GitHub repo URL: ${targetRepo}`);
  }

  try {
    await client.getBranchRef(parsed.owner, parsed.repo, baseBranch);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      throw new Error(
        `base_branch_missing: Target repo ${targetRepo} does not have base branch "${baseBranch}". Create the branch or update repos[].baseBranch before running the harness.`,
      );
    }
    throw error;
  }
}

export function assertPrBaseBranchMatches(input: {
  prUrl: string;
  actualBaseBranch: string;
  expectedBaseBranch: string;
}): void {
  if (input.actualBaseBranch === input.expectedBaseBranch) {
    return;
  }

  throw new Error(
    `wrong_pr_base_branch: PR ${input.prUrl} targets "${input.actualBaseBranch}"; expected "${input.expectedBaseBranch}". Update the PR base branch before continuing.`,
  );
}

export function assertPullRequestMergeable(input: {
  prUrl: string;
  merged: boolean;
  mergeable: boolean | null;
  mergeableState: string | null;
  baseBranch: string;
}): void {
  if (input.merged) {
    return;
  }

  const state = input.mergeableState?.toLowerCase() ?? null;
  if (state === "dirty" || state === "behind" || state === "blocked") {
    throw new Error(
      `pr_not_mergeable: PR ${input.prUrl} is ${state} against "${input.baseBranch}". Update or rebase the PR branch after other merges land, then retry.`,
    );
  }

  if (input.mergeable === false) {
    throw new Error(
      `pr_not_mergeable: PR ${input.prUrl} is not mergeable into "${input.baseBranch}". Resolve conflicts or update the branch, then retry.`,
    );
  }
}
