import type { GitHubClient } from "../github/client.js";
import {
  buildTargetWorkflowBranchName,
  buildTargetWorkflowPrTitle,
  compareTargetWorkflowContent,
} from "./target-workflow-setup.js";

export interface InstallBranchRecoveryProofInput {
  configuredTargetRepoSlug: string;
  observedTargetRepoSlug: string;
  configuredRepoConfigId: string;
  reservedBranchName: string;
  observedBranchName: string;
  configuredProductionBranch: string;
  observedProductionBranch: string;
  configuredWorkflowPath: string;
  pullRequestOwner: string;
  pullRequestRepo: string;
  openPullRequestsOnBranch: number;
}

export type InstallBranchRecoveryProofResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateInstallBranchRecoveryProof(
  input: InstallBranchRecoveryProofInput,
): InstallBranchRecoveryProofResult {
  const expectedBranch = buildTargetWorkflowBranchName(
    input.configuredRepoConfigId,
  );

  if (input.configuredTargetRepoSlug !== input.observedTargetRepoSlug) {
    return {
      ok: false,
      reason: "Install branch recovery target repository mismatch.",
    };
  }
  if (input.reservedBranchName !== expectedBranch) {
    return {
      ok: false,
      reason: "Install branch recovery reserved branch name mismatch.",
    };
  }
  if (input.observedBranchName !== expectedBranch) {
    return {
      ok: false,
      reason: "Install branch recovery PR head branch mismatch.",
    };
  }
  if (input.observedProductionBranch !== input.configuredProductionBranch) {
    return {
      ok: false,
      reason: "Install branch recovery PR base branch mismatch.",
    };
  }
  if (
    `${input.pullRequestOwner}/${input.pullRequestRepo}` !==
    input.configuredTargetRepoSlug
  ) {
    return {
      ok: false,
      reason: "Install branch recovery PR repository mismatch.",
    };
  }
  if (input.openPullRequestsOnBranch !== 1) {
    return {
      ok: false,
      reason:
        "Install branch recovery requires exactly one open PR on the reserved branch.",
    };
  }

  return { ok: true };
}

export interface InstallBranchStalenessInput {
  changedFiles: Array<{ path: string }>;
  workflowPath: string;
  mergeableState: string | null;
  compareStatus?: string | null;
  headWorkflowMatchesIntended: boolean;
  filesValidationPassed: boolean;
}

/**
 * Determines whether a harness-owned install branch is stale enough to warrant
 * force-reset recovery. An empty PR changed-files list alone is not sufficient.
 */
export function isStaleHarnessInstallBranch(
  input: InstallBranchStalenessInput,
): boolean {
  if (!input.headWorkflowMatchesIntended) {
    return true;
  }

  if (input.filesValidationPassed) {
    return false;
  }

  if (!input.headWorkflowMatchesIntended) {
    return true;
  }

  const mergeState = input.mergeableState?.toLowerCase() ?? "";
  const compareState = input.compareStatus?.toLowerCase() ?? "";
  const behindOrDiverged =
    mergeState === "behind" ||
    compareState === "behind" ||
    compareState === "diverged";

  if (behindOrDiverged) {
    return true;
  }

  if (
    input.changedFiles.length === 1 &&
    input.changedFiles[0]?.path !== input.workflowPath
  ) {
    return true;
  }

  if (input.changedFiles.length > 1) {
    return true;
  }

  return false;
}

export interface RecoverHarnessInstallBranchInput {
  client: GitHubClient;
  targetRepoSlug: string;
  productionBranch: string;
  branchName: string;
  workflowPath: string;
  workflowContent: string;
  commitMessage?: string;
}

export interface RecoverHarnessInstallBranchResult {
  recovered: boolean;
  noop?: boolean;
  headSha?: string;
  reason?: string;
}

export async function isInstallBranchAlreadyClean(input: {
  client: GitHubClient;
  targetRepoSlug: string;
  productionBranch: string;
  branchName: string;
  workflowPath: string;
  intendedWorkflowContent: string;
}): Promise<boolean> {
  const [owner, repo] = input.targetRepoSlug.split("/");
  const productionRef = await input.client.getBranchRef(
    owner,
    repo,
    input.productionBranch,
  );
  const branchRef = await input.client.getBranchRef(
    owner,
    repo,
    input.branchName,
  );
  if (branchRef.object.sha === productionRef.object.sha) {
    const headContent = await input.client.getRepositoryContent(
      owner,
      repo,
      input.workflowPath,
      input.branchName,
    );
    if (!headContent) {
      return false;
    }
    const decoded = input.client.decodeRepositoryContent(headContent);
    return (
      compareTargetWorkflowContent(
        decoded,
        input.intendedWorkflowContent,
      ) === "present"
    );
  }

  const compare = await input.client.compareCommits(
    owner,
    repo,
    input.productionBranch,
    input.branchName,
  );
  if (compare.status !== "ahead" || compare.ahead_by !== 1) {
    return false;
  }

  const headContent = await input.client.getRepositoryContent(
    owner,
    repo,
    input.workflowPath,
    input.branchName,
  );
  if (!headContent) {
    return false;
  }
  const decoded = input.client.decodeRepositoryContent(headContent);
  return (
    compareTargetWorkflowContent(decoded, input.intendedWorkflowContent) ===
    "present"
  );
}

export async function recoverHarnessInstallBranch(
  input: RecoverHarnessInstallBranchInput,
): Promise<RecoverHarnessInstallBranchResult> {
  const [owner, repo] = input.targetRepoSlug.split("/");

  const productionRef = await input.client.getBranchRef(
    owner,
    repo,
    input.productionBranch,
  );
  const productionSha = productionRef.object.sha;

  await input.client.updateGitRef({
    owner,
    repo,
    ref: input.branchName,
    sha: productionSha,
    force: true,
  });

  const existingOnBranch = await input.client.getRepositoryContent(
    owner,
    repo,
    input.workflowPath,
    input.branchName,
  );
  const existingSha = existingOnBranch?.sha;

  await input.client.createOrUpdateRepositoryFile({
    owner,
    repo,
    path: input.workflowPath,
    branch: input.branchName,
    message: input.commitMessage ?? buildTargetWorkflowPrTitle(),
    content: input.workflowContent,
    sha: existingSha,
  });

  const branchRef = await input.client.getBranchRef(
    owner,
    repo,
    input.branchName,
  );

  return {
    recovered: true,
    headSha: branchRef.object.sha,
  };
}

export async function countOpenPullRequestsOnBranch(
  client: GitHubClient,
  input: {
    targetRepoSlug: string;
    productionBranch: string;
    branchName: string;
  },
): Promise<number> {
  const [owner, repo] = input.targetRepoSlug.split("/");
  const pulls = await client.listPullRequests(owner, repo, {
    state: "open",
    base: input.productionBranch,
    head: `${owner}:${input.branchName}`,
  });
  return pulls.length;
}
