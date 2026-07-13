import type {
  HarnessActionsSecretName,
  HarnessSecretStatusEntry,
  RemoteAccessStatus,
  RemoteWorkflowStatus,
} from "./remote-actions.js";
import { HARNESS_ACTIONS_SECRET_NAMES } from "./remote-actions.js";
import type { GitHubTokenType } from "./github-workflow-permissions.js";

export interface GitHubRepositoryMetadata {
  repositoryId: number;
  owner: string;
  repo: string;
  private: boolean;
  visibility: string;
  isTemplate: boolean;
  defaultBranch: string;
  permissions: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
  };
}

export interface AuthenticatedGitHubUser {
  id: number;
  login: string;
}

export interface GitHubTokenCapabilitySummary {
  login: string;
  tokenType: GitHubTokenType;
  hasRepoScope: boolean;
  hasWorkflowScope: boolean;
  scopeAmbiguous: boolean;
}

export interface CreateRepositoryFromTemplateInput {
  templateOwner: string;
  templateRepo: string;
  owner: string;
  name: string;
  description: string;
  private: boolean;
  includeAllBranches: boolean;
}

export interface CreateRepositoryFromTemplateResult {
  repositoryId: number;
  fullName: string;
  defaultBranch: string;
}

export interface RepositoryFileWriteInput {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  message: string;
  content: string;
  sha?: string;
}

export interface GitHubHarnessProvisioningProvider {
  resolveAuthenticatedUser(): Promise<AuthenticatedGitHubUser>;
  inspectTokenCapabilities(): Promise<GitHubTokenCapabilitySummary>;
  getRepositoryMetadata(
    owner: string,
    repo: string,
  ): Promise<GitHubRepositoryMetadata | null>;
  getRepositoryMetadataById(
    repositoryId: number,
  ): Promise<GitHubRepositoryMetadata | null>;
  getRepositoryDefaultBranchHead(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string>;
  readRepositoryFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null>;
  createRepositoryFromTemplate(
    input: CreateRepositoryFromTemplateInput,
  ): Promise<CreateRepositoryFromTemplateResult>;
  writeRepositoryFile(
    input: RepositoryFileWriteInput,
  ): Promise<{ commitSha: string }>;
}

export interface HarnessSecretWriteRequest {
  name: HarnessActionsSecretName;
  value: string;
}

export interface HarnessSecretWriteResultEntry {
  name: HarnessActionsSecretName;
  status: "created" | "updated";
}

export interface TargetWorkflowApplyInput {
  targetRepoSlug: string;
  productionBranch: string;
  branchName: string;
  workflowPath: string;
  workflowContent: string;
  prTitle: string;
  prBody: string;
}

export type TargetWorkflowApplyOutcome =
  | "already-installed"
  | "pr-created"
  | "pr-updated"
  | "branch-updated";

export interface TargetWorkflowApplyResult {
  outcome: TargetWorkflowApplyOutcome;
  branchName: string;
  prUrl?: string;
  directProductionBranchWrite: false;
}

export interface GitHubRemoteSetupProvider {
  checkHarnessRepoAccess(harnessDispatchRepo: string): Promise<RemoteAccessStatus>;
  listHarnessSecretStatuses(
    harnessDispatchRepo: string,
  ): Promise<HarnessSecretStatusEntry[]>;
  checkTargetWorkflowStatus(input: {
    targetRepoSlug: string;
    workflowPath: string;
    intendedWorkflowContent: string;
    productionBranch: string;
  }): Promise<{
    repoAccess: RemoteAccessStatus;
    workflowStatus: RemoteWorkflowStatus;
    productionBranchSha?: string;
  }>;
  writeHarnessSecrets(
    harnessDispatchRepo: string,
    secrets: HarnessSecretWriteRequest[],
  ): Promise<HarnessSecretWriteResultEntry[]>;
  applyTargetWorkflowPr(
    input: TargetWorkflowApplyInput,
  ): Promise<TargetWorkflowApplyResult>;
}

export interface MockGitHubRemoteSetupProviderState {
  harnessRepoAccess?: RemoteAccessStatus;
  harnessSecretStatuses?: Partial<
    Record<HarnessActionsSecretName, HarnessSecretStatusEntry["status"]>
  >;
  targetRepoAccess?: RemoteAccessStatus;
  existingWorkflowContent?: string | null;
  productionBranchSha?: string;
  existingOpenPrUrl?: string;
  writeHarnessSecretsResult?: HarnessSecretWriteResultEntry[];
  applyTargetWorkflowResult?: TargetWorkflowApplyResult;
}

export class MockGitHubRemoteSetupProvider implements GitHubRemoteSetupProvider {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  readonly encryptedWrites: Array<{
    harnessDispatchRepo: string;
    secretName: string;
    encryptedValue: string;
  }> = [];

  constructor(private readonly state: MockGitHubRemoteSetupProviderState = {}) {}

  async checkHarnessRepoAccess(
    harnessDispatchRepo: string,
  ): Promise<RemoteAccessStatus> {
    this.calls.push({
      method: "checkHarnessRepoAccess",
      args: [harnessDispatchRepo],
    });
    return this.state.harnessRepoAccess ?? "unknown";
  }

  async listHarnessSecretStatuses(
    harnessDispatchRepo: string,
  ): Promise<HarnessSecretStatusEntry[]> {
    this.calls.push({
      method: "listHarnessSecretStatuses",
      args: [harnessDispatchRepo],
    });

    return HARNESS_ACTIONS_SECRET_NAMES.map((name) => ({
      name,
      status: this.state.harnessSecretStatuses?.[name] ?? "unknown",
    }));
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
    this.calls.push({
      method: "checkTargetWorkflowStatus",
      args: [input],
    });

    const existing = this.state.existingWorkflowContent;
    let workflowStatus: RemoteWorkflowStatus = "unknown";
    if (existing === null || existing === undefined) {
      workflowStatus = "missing";
    } else if (existing === input.intendedWorkflowContent) {
      workflowStatus = "present";
    } else {
      workflowStatus = "differs";
    }

    return {
      repoAccess: this.state.targetRepoAccess ?? "unknown",
      workflowStatus,
      productionBranchSha: this.state.productionBranchSha,
    };
  }

  async writeHarnessSecrets(
    harnessDispatchRepo: string,
    secrets: HarnessSecretWriteRequest[],
  ): Promise<HarnessSecretWriteResultEntry[]> {
    this.calls.push({
      method: "writeHarnessSecrets",
      args: [harnessDispatchRepo, secrets.map((entry) => entry.name)],
    });

    for (const secret of secrets) {
      this.encryptedWrites.push({
        harnessDispatchRepo,
        secretName: secret.name,
        encryptedValue: `encrypted:${secret.value.length}`,
      });
    }

    return (
      this.state.writeHarnessSecretsResult ??
      secrets.map((secret) => ({
        name: secret.name,
        status:
          this.state.harnessSecretStatuses?.[secret.name] === "present"
            ? "updated"
            : "created",
      }))
    );
  }

  async applyTargetWorkflowPr(
    input: TargetWorkflowApplyInput,
  ): Promise<TargetWorkflowApplyResult> {
    this.calls.push({
      method: "applyTargetWorkflowPr",
      args: [
        {
          ...input,
          workflowContent: `<redacted:${input.workflowContent.length}>`,
        },
      ],
    });

    if (input.branchName === input.productionBranch) {
      throw new Error("Direct production branch writes are not allowed");
    }

    if (this.state.applyTargetWorkflowResult) {
      return this.state.applyTargetWorkflowResult;
    }

    if (this.state.existingWorkflowContent === input.workflowContent) {
      return {
        outcome: "already-installed",
        branchName: input.branchName,
        directProductionBranchWrite: false,
      };
    }

    return {
      outcome: this.state.existingOpenPrUrl ? "pr-updated" : "pr-created",
      branchName: input.branchName,
      prUrl:
        this.state.existingOpenPrUrl ??
        `https://github.com/${input.targetRepoSlug}/pull/1`,
      directProductionBranchWrite: false,
    };
  }
}

export interface MockGitHubHarnessProvisioningProviderState {
  authenticatedUser?: AuthenticatedGitHubUser;
  tokenCapabilities?: GitHubTokenCapabilitySummary;
  repositories?: Record<
    string,
    GitHubRepositoryMetadata & {
      templateIdentityContent?: string | null;
      managedMarkerContent?: string | null;
      branchHeadSha?: string;
    }
  >;
  createRepositoryFromTemplateResult?: CreateRepositoryFromTemplateResult;
  createRepositoryFromTemplateError?: Error;
  deferDestinationTemplateIdentity?: boolean;
  writeRepositoryFileError?: Error | null;
  fileWrites?: Array<RepositoryFileWriteInput & { commitSha: string }>;
}

export function deterministicMockRepositoryId(slug: string): number {
  let hash = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (hash * 31 + slug.charCodeAt(index)) % 900_000_000;
  }
  return 100_000 + hash;
}

function withRepositoryId(
  slug: string,
  metadata: GitHubRepositoryMetadata & {
    templateIdentityContent?: string | null;
    managedMarkerContent?: string | null;
    branchHeadSha?: string;
  },
): GitHubRepositoryMetadata & {
  templateIdentityContent?: string | null;
  managedMarkerContent?: string | null;
  branchHeadSha?: string;
} {
  return {
    ...metadata,
    repositoryId:
      Number.isInteger(metadata.repositoryId) && metadata.repositoryId > 0
        ? metadata.repositoryId
        : deterministicMockRepositoryId(slug),
  };
}

export class MockGitHubHarnessProvisioningProvider
  implements GitHubHarnessProvisioningProvider
{
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private repositories: Record<
    string,
    GitHubRepositoryMetadata & {
      templateIdentityContent?: string | null;
      managedMarkerContent?: string | null;
      branchHeadSha?: string;
    }
  >;

  constructor(
    private readonly state: MockGitHubHarnessProvisioningProviderState = {},
  ) {
    this.repositories = Object.fromEntries(
      Object.entries(state.repositories ?? {}).map(([slug, metadata]) => [
        slug,
        withRepositoryId(slug, metadata),
      ]),
    );
  }

  async resolveAuthenticatedUser(): Promise<AuthenticatedGitHubUser> {
    this.calls.push({ method: "resolveAuthenticatedUser", args: [] });
    return (
      this.state.authenticatedUser ?? {
        id: 1,
        login: "test-user",
      }
    );
  }

  async inspectTokenCapabilities(): Promise<GitHubTokenCapabilitySummary> {
    this.calls.push({ method: "inspectTokenCapabilities", args: [] });
    return (
      this.state.tokenCapabilities ?? {
        login: "test-user",
        tokenType: "classic",
        hasRepoScope: true,
        hasWorkflowScope: true,
        scopeAmbiguous: false,
      }
    );
  }

  async getRepositoryMetadata(
    owner: string,
    repo: string,
  ): Promise<GitHubRepositoryMetadata | null> {
    this.calls.push({ method: "getRepositoryMetadata", args: [owner, repo] });
    const key = `${owner}/${repo}`;
    const entry = this.repositories[key];
    if (!entry) {
      return null;
    }
    const { templateIdentityContent: _t, managedMarkerContent: _m, branchHeadSha: _b, ...metadata } =
      entry;
    return metadata;
  }

  async getRepositoryMetadataById(
    repositoryId: number,
  ): Promise<GitHubRepositoryMetadata | null> {
    this.calls.push({
      method: "getRepositoryMetadataById",
      args: [repositoryId],
    });
    for (const entry of Object.values(this.repositories)) {
      if (entry.repositoryId === repositoryId) {
        const {
          templateIdentityContent: _t,
          managedMarkerContent: _m,
          branchHeadSha: _b,
          ...metadata
        } = entry;
        return metadata;
      }
    }
    return null;
  }

  async getRepositoryDefaultBranchHead(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> {
    this.calls.push({
      method: "getRepositoryDefaultBranchHead",
      args: [owner, repo, branch],
    });
    const key = `${owner}/${repo}`;
    return this.repositories[key]?.branchHeadSha ?? "abc123templatehead";
  }

  async readRepositoryFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null> {
    this.calls.push({
      method: "readRepositoryFileContent",
      args: [owner, repo, path, ref],
    });
    const key = `${owner}/${repo}`;
    const entry = this.repositories[key];
    if (!entry) {
      return null;
    }
    if (path.endsWith("p-dev-template.json")) {
      return entry.templateIdentityContent ?? null;
    }
    if (path.endsWith("p-dev-managed-repo.json")) {
      return entry.managedMarkerContent ?? null;
    }
    void ref;
    return null;
  }

  async createRepositoryFromTemplate(
    input: CreateRepositoryFromTemplateInput,
  ): Promise<CreateRepositoryFromTemplateResult> {
    this.calls.push({ method: "createRepositoryFromTemplate", args: [input] });
    if (this.state.createRepositoryFromTemplateError) {
      throw this.state.createRepositoryFromTemplateError;
    }
    const result =
      this.state.createRepositoryFromTemplateResult ?? {
        repositoryId: deterministicMockRepositoryId(`${input.owner}/${input.name}`),
        fullName: `${input.owner}/${input.name}`,
        defaultBranch: "main",
      };
    const key = result.fullName;
    const templateSource =
      this.repositories[`${input.templateOwner}/${input.templateRepo}`]
        ?.templateIdentityContent ?? null;
    this.repositories[key] = withRepositoryId(key, {
      owner: input.owner,
      repo: input.name,
      repositoryId: result.repositoryId,
      private: input.private,
      visibility: input.private ? "private" : "public",
      isTemplate: false,
      defaultBranch: result.defaultBranch,
      permissions: { admin: true, maintain: true, push: true },
      templateIdentityContent: this.state.deferDestinationTemplateIdentity
        ? null
        : templateSource,
      managedMarkerContent: null,
      branchHeadSha: "generatedheadsha",
    });
    return result;
  }

  revealDestinationTemplateIdentity(
    slug: string,
    templateIdentityContent: string,
  ): void {
    const entry = this.repositories[slug];
    if (entry) {
      entry.templateIdentityContent = templateIdentityContent;
    }
  }

  async writeRepositoryFile(
    input: RepositoryFileWriteInput,
  ): Promise<{ commitSha: string }> {
    this.calls.push({ method: "writeRepositoryFile", args: [input] });
    if (this.state.writeRepositoryFileError) {
      const error = this.state.writeRepositoryFileError;
      this.state.writeRepositoryFileError = null;
      throw error;
    }
    const key = `${input.owner}/${input.repo}`;
    const entry = this.repositories[key];
    if (entry && input.path.endsWith("p-dev-managed-repo.json")) {
      entry.managedMarkerContent = input.content;
    }
    const commitSha = `commit-${this.state.fileWrites?.length ?? 0}`;
    this.state.fileWrites = [
      ...(this.state.fileWrites ?? []),
      { ...input, commitSha },
    ];
    return { commitSha };
  }

  setRepository(
    slug: string,
    metadata: GitHubRepositoryMetadata & {
      templateIdentityContent?: string | null;
      managedMarkerContent?: string | null;
      branchHeadSha?: string;
    },
  ): void {
    this.repositories[slug] = withRepositoryId(slug, metadata);
  }
}

export function mapGitHubSecretMetadataToStatus(
  secretNames: readonly string[],
  knownSecretNames: readonly HarnessActionsSecretName[],
): HarnessSecretStatusEntry[] {
  const known = new Set(secretNames);
  return knownSecretNames.map((name) => ({
    name,
    status: known.has(name) ? "present" : "missing",
  }));
}

export function mapGitHubAccessErrorToStatus(statusCode: number): RemoteAccessStatus {
  if (statusCode === 401 || statusCode === 403) {
    return "denied";
  }
  if (statusCode === 404) {
    return "denied";
  }
  return "unknown";
}
