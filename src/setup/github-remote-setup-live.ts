import { redactSecretsString } from "../artifacts/redact.js";
import {
  GitHubApiError,
  GitHubClient,
  type GitHubClientOptions,
} from "../github/client.js";
import { encryptGitHubActionsSecret } from "./github-secret-encryption.js";
import {
  compareTargetWorkflowContent,
  hashWorkflowContent,
} from "./target-workflow-setup.js";
import {
  HARNESS_ACTIONS_SECRET_NAMES,
  type HarnessSecretStatusEntry,
  type RemoteAccessStatus,
  type RemoteWorkflowStatus,
} from "./remote-actions.js";
import {
  mapGitHubAccessErrorToStatus,
  mapGitHubSecretMetadataToStatus,
  type GitHubRemoteSetupProvider,
  type HarnessSecretWriteRequest,
  type HarnessSecretWriteResultEntry,
  type TargetWorkflowApplyInput,
  type TargetWorkflowApplyResult,
} from "./github-remote-provider.js";

export function parseRepoSlug(slug: string): { owner: string; repo: string } {
  const [owner, repo] = slug.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repo slug: ${slug}`);
  }
  return { owner, repo };
}

export function sanitizeGitHubSetupError(error: unknown): string {
  if (error instanceof GitHubApiError) {
    return redactSecretsString(error.message);
  }
  if (error instanceof Error) {
    return redactSecretsString(error.message);
  }
  return redactSecretsString(String(error));
}

export class LiveGitHubRemoteSetupProvider implements GitHubRemoteSetupProvider {
  private readonly client: GitHubClient;

  constructor(options: GitHubClientOptions | GitHubClient) {
    this.client =
      options instanceof GitHubClient
        ? options
        : new GitHubClient(options);
  }

  async checkHarnessRepoAccess(
    harnessDispatchRepo: string,
  ): Promise<RemoteAccessStatus> {
    try {
      const { owner, repo } = parseRepoSlug(harnessDispatchRepo);
      const repository = await this.client.getRepository(owner, repo);
      if (
        repository.permissions?.admin === true ||
        repository.permissions?.maintain === true
      ) {
        return "available";
      }
      return "denied";
    } catch (error) {
      if (error instanceof GitHubApiError) {
        return mapGitHubAccessErrorToStatus(error.status);
      }
      return "unknown";
    }
  }

  async listHarnessSecretStatuses(
    harnessDispatchRepo: string,
  ): Promise<HarnessSecretStatusEntry[]> {
    try {
      const { owner, repo } = parseRepoSlug(harnessDispatchRepo);
      const response = await this.client.listActionsSecrets(owner, repo);
      return mapGitHubSecretMetadataToStatus(
        response.secrets.map((secret) => secret.name),
        HARNESS_ACTIONS_SECRET_NAMES,
      );
    } catch (error) {
      if (error instanceof GitHubApiError) {
        if (error.status === 401 || error.status === 403 || error.status === 404) {
          return HARNESS_ACTIONS_SECRET_NAMES.map((name: (typeof HARNESS_ACTIONS_SECRET_NAMES)[number]) => ({
            name,
            status: "unknown" as const,
          }));
        }
      }
      throw new Error(sanitizeGitHubSetupError(error));
    }
  }

  async writeHarnessSecrets(
    harnessDispatchRepo: string,
    secrets: HarnessSecretWriteRequest[],
  ): Promise<HarnessSecretWriteResultEntry[]> {
    const { owner, repo } = parseRepoSlug(harnessDispatchRepo);
    const publicKey = await this.client.getActionsPublicKey(owner, repo);
    const existing = await this.listHarnessSecretStatuses(harnessDispatchRepo);
    const existingNames = new Set(
      existing
        .filter((entry) => entry.status === "present")
        .map((entry) => entry.name),
    );

    const results: HarnessSecretWriteResultEntry[] = [];
    for (const secret of secrets) {
      const encryptedValue = encryptGitHubActionsSecret(
        secret.value,
        publicKey.key,
      );
      await this.client.upsertActionsSecret(
        owner,
        repo,
        secret.name,
        encryptedValue,
        publicKey.key_id,
      );
      results.push({
        name: secret.name,
        status: existingNames.has(secret.name) ? "updated" : "created",
      });
    }
    return results;
  }

  async checkTargetWorkflowStatus(input: {
    targetRepoSlug: string;
    workflowPath: string;
    intendedWorkflowContent: string;
    productionBranch: string;
  }): Promise<{
    repoAccess: RemoteAccessStatus;
    workflowStatus: RemoteWorkflowStatus;
    productionBranchSha?: string;
  }> {
    try {
      const { owner, repo } = parseRepoSlug(input.targetRepoSlug);
      const repository = await this.client.getRepository(owner, repo);
      const repoAccess =
        repository.permissions?.push === true ||
        repository.permissions?.admin === true
          ? "available"
          : "denied";

      const productionRef = await this.client.getBranchRef(
        owner,
        repo,
        input.productionBranch,
      );
      const productionBranchSha = productionRef.object.sha;
      const content = await this.client.getRepositoryContent(
        owner,
        repo,
        input.workflowPath,
        input.productionBranch,
      );
      const existingContent = content
        ? this.client.decodeRepositoryContent(content)
        : null;
      const workflowStatus = compareTargetWorkflowContent(
        existingContent,
        input.intendedWorkflowContent,
      );

      return {
        repoAccess,
        workflowStatus,
        productionBranchSha,
      };
    } catch (error) {
      if (error instanceof GitHubApiError) {
        if (error.status === 404) {
          return {
            repoAccess: "denied",
            workflowStatus: "unknown",
          };
        }
        return {
          repoAccess: mapGitHubAccessErrorToStatus(error.status),
          workflowStatus: "unknown",
        };
      }
      throw new Error(sanitizeGitHubSetupError(error));
    }
  }

  async applyTargetWorkflowPr(
    input: TargetWorkflowApplyInput,
  ): Promise<TargetWorkflowApplyResult> {
    if (input.branchName === input.productionBranch) {
      throw new Error("Direct production branch writes are not allowed");
    }

    const { owner, repo } = parseRepoSlug(input.targetRepoSlug);
    const productionContent = await this.client.getRepositoryContent(
      owner,
      repo,
      input.workflowPath,
      input.productionBranch,
    );
    if (productionContent) {
      const existingOnProduction = this.client.decodeRepositoryContent(
        productionContent,
      );
      if (
        hashWorkflowContent(existingOnProduction) ===
        hashWorkflowContent(input.workflowContent)
      ) {
        return {
          outcome: "already-installed",
          branchName: input.branchName,
          directProductionBranchWrite: false,
        };
      }
    }

    const productionRef = await this.client.getBranchRef(
      owner,
      repo,
      input.productionBranch,
    );
    const productionSha = productionRef.object.sha;

    let installBranchExists = true;
    try {
      await this.client.getBranchRef(owner, repo, input.branchName);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        installBranchExists = false;
      } else {
        throw error;
      }
    }

    if (!installBranchExists) {
      await this.client.createGitRef(
        owner,
        repo,
        input.branchName,
        productionSha,
      );
    }

    const existingOnBranch = await this.client.getRepositoryContent(
      owner,
      repo,
      input.workflowPath,
      input.branchName,
    );
    const existingSha = existingOnBranch?.sha;
    const existingContent = existingOnBranch
      ? this.client.decodeRepositoryContent(existingOnBranch)
      : null;

    if (
      existingContent &&
      hashWorkflowContent(existingContent) ===
        hashWorkflowContent(input.workflowContent)
    ) {
      const openPr = await this.findOpenInstallPullRequest(input);
      return {
        outcome: openPr ? "pr-updated" : "branch-updated",
        branchName: input.branchName,
        prUrl: openPr?.html_url,
        directProductionBranchWrite: false,
      };
    }

    await this.client.createOrUpdateRepositoryFile({
      owner,
      repo,
      path: input.workflowPath,
      branch: input.branchName,
      message: input.prTitle,
      content: input.workflowContent,
      sha: existingSha,
    });

    const openPr = await this.findOpenInstallPullRequest(input);
    if (openPr) {
      return {
        outcome: "pr-updated",
        branchName: input.branchName,
        prUrl: openPr.html_url,
        directProductionBranchWrite: false,
      };
    }

    const created = await this.client.createPullRequest({
      owner,
      repo,
      title: input.prTitle,
      head: input.branchName,
      base: input.productionBranch,
      body: input.prBody,
    });

    return {
      outcome: "pr-created",
      branchName: input.branchName,
      prUrl: created.html_url,
      directProductionBranchWrite: false,
    };
  }

  private async findOpenInstallPullRequest(input: TargetWorkflowApplyInput) {
    const { owner, repo } = parseRepoSlug(input.targetRepoSlug);
    const pulls = await this.client.listPullRequests(owner, repo, {
      state: "open",
      base: input.productionBranch,
      head: `${owner}:${input.branchName}`,
    });
    return pulls[0];
  }
}

export function createLiveGitHubRemoteSetupProvider(
  token: string,
): GitHubRemoteSetupProvider {
  return new LiveGitHubRemoteSetupProvider({ token });
}
