import type {
  HarnessActionsSecretName,
  HarnessSecretStatusEntry,
  RemoteAccessStatus,
  RemoteWorkflowStatus,
} from "./remote-actions.js";
import { HARNESS_ACTIONS_SECRET_NAMES } from "./remote-actions.js";
import type { GitHubTokenType } from "./github-workflow-permissions.js";
import type {
  TargetWorkflowFinalizeInput,
  TargetWorkflowFinalizationResult,
} from "./target-workflow-finalization-types.js";
import {
  advanceMockTargetWorkflowFinalization,
  type MockWorkflowFinalizationScenario,
} from "./mock-target-workflow-finalization.js";
import { previewTargetWorkflowSetup } from "./target-workflow-setup.js";
import {
  type HarnessDispatchRepoResolution,
} from "./harness-dispatch-repo.js";
import {
  computeGitBlobSha1,
  computeGitTreeSha1,
} from "../p-dev/workspace-snapshot-git.js";
import { computeSnapshotRootTreeSha1 } from "../p-dev/workspace-snapshot-digest.js";

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

export interface CreateUserRepositoryInput {
  name: string;
  description: string;
  private: boolean;
  autoInit: boolean;
}

export interface CreateUserRepositoryResult {
  repositoryId: number;
  fullName: string;
  defaultBranch: string;
}

export interface GitBlobResult {
  sha: string;
}

export interface GitTreeEntryInput {
  path?: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
}

export interface GitTreeResult {
  sha: string;
}

export interface GitCommitResult {
  sha: string;
  tree: { sha: string };
  parents: Array<{ sha: string }>;
}

export interface GitRefResult {
  ref: string;
  object: { sha: string };
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
  createUserRepository(
    input: CreateUserRepositoryInput,
  ): Promise<CreateUserRepositoryResult>;
  createGitBlob(input: {
    owner: string;
    repo: string;
    content: Buffer;
  }): Promise<GitBlobResult>;
  createGitTree(input: {
    owner: string;
    repo: string;
    tree: GitTreeEntryInput[];
  }): Promise<GitTreeResult>;
  createGitCommit(input: {
    owner: string;
    repo: string;
    message: string;
    tree: string;
    parents: string[];
  }): Promise<GitCommitResult>;
  getGitCommit(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<GitCommitResult>;
  getGitRef(owner: string, repo: string, ref: string): Promise<GitRefResult>;
  updateGitRef(input: {
    owner: string;
    repo: string;
    ref: string;
    sha: string;
    force?: boolean;
  }): Promise<GitRefResult>;
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
  finalizationScenario?: MockWorkflowFinalizationScenario;
  harnessDispatchRepo?: HarnessDispatchRepoResolution;
}

export class MockGitHubRemoteSetupProvider implements GitHubRemoteSetupProvider {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  readonly encryptedWrites: Array<{
    harnessDispatchRepo: string;
    secretName: string;
    encryptedValue: string;
  }> = [];
  private mutableWorkflowContent: string | null | undefined;

  constructor(private readonly state: MockGitHubRemoteSetupProviderState = {}) {
    this.mutableWorkflowContent = state.existingWorkflowContent;
  }

  advanceTargetWorkflowFinalization(
    input: TargetWorkflowFinalizeInput,
  ): TargetWorkflowFinalizationResult {
    this.calls.push({
      method: "advanceTargetWorkflowFinalization",
      args: [input],
    });

    const harnessDispatchRepo =
      this.state.harnessDispatchRepo ??
      ({
        resolved: true,
        repo: "owner/harness-repo",
        source: "explicit-config",
      } satisfies HarnessDispatchRepoResolution);
    const preview = previewTargetWorkflowSetup({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      productionBranch: input.productionBranch,
      harnessDispatchRepo,
    });

    return advanceMockTargetWorkflowFinalization({
      finalizeInput: input,
      intendedWorkflowContent: preview.workflowContent,
      existingWorkflowContent: this.mutableWorkflowContent,
      scenario: this.state.finalizationScenario,
      onProductionWorkflowUpdate: (content) => {
        this.mutableWorkflowContent = content;
      },
    });
  }

  setExistingWorkflowContent(content: string | null): void {
    this.mutableWorkflowContent = content;
  }

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

    const existing = this.mutableWorkflowContent ?? this.state.existingWorkflowContent;
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
  markerCommitError?: Error | null;
  markerCommitErrorsRemaining?: number;
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
    return (
      this.repositories[key]?.branchHeadSha ??
      (this.repositories[key] as { gitHeadSha?: string } | undefined)?.gitHeadSha ??
      "abc123templatehead"
    );
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

    const extended = entry as typeof entry & {
      gitBlobs?: Record<string, Buffer>;
      gitTrees?: Record<string, Array<{ mode: string; path: string; sha: string }>>;
      gitCommits?: Record<
        string,
        { treeSha: string; parents: string[]; message: string }
      >;
      gitHeadSha?: string;
      fileContents?: Record<string, string>;
    };

    const commit = extended.gitCommits?.[ref];
    const hasGitHistory = Boolean(
      extended.gitCommits && Object.keys(extended.gitCommits).length > 0,
    );
    if (commit) {
      const treeEntries = extended.gitTrees?.[commit.treeSha] ?? [];
      const treeEntry = treeEntries.find((candidate) => candidate.path === path);
      if (treeEntry) {
        const blob = extended.gitBlobs?.[treeEntry.sha];
        return blob ? blob.toString("utf8") : null;
      }
      return null;
    }

    if (path.endsWith("p-dev-template.json")) {
      return entry.templateIdentityContent ?? null;
    }
    if (path.endsWith("p-dev-managed-repo.json")) {
      if (hasGitHistory) {
        return null;
      }
      const extendedContents = extended.fileContents?.[path];
      if (extendedContents) {
        return extendedContents;
      }
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

  private ensureGitStore(key: string): {
    blobs: Record<string, Buffer>;
    trees: Record<string, Array<{ mode: string; path: string; sha: string }>>;
    commits: Record<string, { treeSha: string; parents: string[]; message: string }>;
    headSha: string;
  } {
    const entry = this.repositories[key];
    if (!entry) {
      throw new Error(`Mock repository ${key} does not exist.`);
    }
    const extended = entry as typeof entry & {
      gitBlobs?: Record<string, Buffer>;
      gitTrees?: Record<string, Array<{ mode: string; path: string; sha: string }>>;
      gitCommits?: Record<
        string,
        { treeSha: string; parents: string[]; message: string }
      >;
      gitHeadSha?: string;
      fileContents?: Record<string, string>;
    };
    extended.gitBlobs ??= {};
    extended.gitTrees ??= {};
    extended.gitCommits ??= {};
    extended.fileContents ??= {};
    if (!extended.gitHeadSha) {
      const initBlob = Buffer.from("# p-dev\n", "utf8");
      const initBlobSha = computeGitBlobSha1(initBlob);
      extended.gitBlobs[initBlobSha] = initBlob;
      const treeSha = computeGitTreeSha1([
        { mode: "100644", path: "README.md", sha1: initBlobSha },
      ]);
      extended.gitTrees[treeSha] = [
        { mode: "100644", path: "README.md", sha: initBlobSha },
      ];
      const initCommitSha = `init-${key.replace(/\//g, "-")}`;
      extended.gitCommits[initCommitSha] = {
        treeSha,
        parents: [],
        message: "Initial commit",
      };
      extended.gitHeadSha = initCommitSha;
      extended.branchHeadSha = initCommitSha;
    }
    return {
      blobs: extended.gitBlobs,
      trees: extended.gitTrees,
      commits: extended.gitCommits,
      headSha: extended.gitHeadSha,
    };
  }

  async createUserRepository(
    input: CreateUserRepositoryInput,
  ): Promise<CreateUserRepositoryResult> {
    this.calls.push({ method: "createUserRepository", args: [input] });
    const fullName = `test-user/${input.name}`;
    const key = fullName;
    const repositoryId = deterministicMockRepositoryId(key);
    this.repositories[key] = withRepositoryId(key, {
      owner: "test-user",
      repo: input.name,
      repositoryId,
      private: input.private,
      visibility: input.private ? "private" : "public",
      isTemplate: false,
      defaultBranch: "main",
      permissions: { admin: true, maintain: true, push: true },
      templateIdentityContent: null,
      managedMarkerContent: null,
      branchHeadSha: "",
    });
    if (input.autoInit) {
      this.ensureGitStore(key);
    }
    return {
      repositoryId,
      fullName: key,
      defaultBranch: "main",
    };
  }

  async createGitBlob(input: {
    owner: string;
    repo: string;
    content: Buffer;
  }): Promise<GitBlobResult> {
    this.calls.push({
      method: "createGitBlob",
      args: [{ owner: input.owner, repo: input.repo, bytes: input.content.byteLength }],
    });
    const key = `${input.owner}/${input.repo}`;
    const store = this.ensureGitStore(key);
    const sha = computeGitBlobSha1(input.content);
    store.blobs[sha] = input.content;
    return { sha };
  }

  async createGitTree(input: {
    owner: string;
    repo: string;
    tree: GitTreeEntryInput[];
  }): Promise<GitTreeResult> {
    this.calls.push({ method: "createGitTree", args: [input] });
    const key = `${input.owner}/${input.repo}`;
    const store = this.ensureGitStore(key);
    const entry = this.repositories[key] as typeof this.repositories[string] & {
      managedMarkerContent?: string | null;
    };
    const entries = input.tree.map((treeEntry) => ({
      mode: treeEntry.mode,
      path: treeEntry.path ?? "",
      sha: treeEntry.sha,
    }));
    for (const treeEntry of entries) {
      if (treeEntry.path.endsWith("p-dev-managed-repo.json")) {
        entry.managedMarkerContent = store.blobs[treeEntry.sha]?.toString("utf8") ?? null;
      }
    }
    const sha = computeSnapshotRootTreeSha1(
      entries.map((treeEntry) => ({
        path: treeEntry.path,
        type: "file" as const,
        mode: treeEntry.mode,
        size: store.blobs[treeEntry.sha]?.byteLength ?? 0,
        sha256: "0".repeat(64),
        gitBlobSha1: treeEntry.sha,
      })),
    );
    store.trees[sha] = entries;
    return { sha };
  }

  async createGitCommit(input: {
    owner: string;
    repo: string;
    message: string;
    tree: string;
    parents: string[];
  }): Promise<GitCommitResult> {
    this.calls.push({ method: "createGitCommit", args: [input] });
    if (/managed harness workspace marker/i.test(input.message)) {
      if (this.state.markerCommitError) {
        throw this.state.markerCommitError;
      }
      if (
        this.state.markerCommitErrorsRemaining !== undefined &&
        this.state.markerCommitErrorsRemaining > 0
      ) {
        this.state.markerCommitErrorsRemaining -= 1;
        throw new Error("marker commit failed");
      }
    }
    const key = `${input.owner}/${input.repo}`;
    const store = this.ensureGitStore(key);
    const sha = `commit-${Object.keys(store.commits).length + 1}-${key.replace(/\//g, "-")}`;
    store.commits[sha] = {
      treeSha: input.tree,
      parents: [...input.parents],
      message: input.message,
    };
    return {
      sha,
      tree: { sha: input.tree },
      parents: input.parents.map((parent) => ({ sha: parent })),
    };
  }

  async getGitCommit(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<GitCommitResult> {
    this.calls.push({ method: "getGitCommit", args: [owner, repo, sha] });
    const key = `${owner}/${repo}`;
    const store = this.ensureGitStore(key);
    const commit = store.commits[sha];
    if (!commit) {
      throw new Error(`Mock git commit ${sha} not found.`);
    }
    return {
      sha,
      tree: { sha: commit.treeSha },
      parents: commit.parents.map((parent) => ({ sha: parent })),
    };
  }

  async getGitRef(owner: string, repo: string, ref: string): Promise<GitRefResult> {
    this.calls.push({ method: "getGitRef", args: [owner, repo, ref] });
    const key = `${owner}/${repo}`;
    const store = this.ensureGitStore(key);
    return {
      ref: `refs/heads/${ref}`,
      object: { sha: store.headSha },
    };
  }

  async updateGitRef(input: {
    owner: string;
    repo: string;
    ref: string;
    sha: string;
    force?: boolean;
  }): Promise<GitRefResult> {
    this.calls.push({ method: "updateGitRef", args: [input] });
    if (input.force) {
      throw new Error("Force ref updates are not allowed in mock provisioning.");
    }
    const key = `${input.owner}/${input.repo}`;
    const entry = this.repositories[key] as typeof this.repositories[string] & {
      gitHeadSha?: string;
      fileContents?: Record<string, string>;
      managedMarkerContent?: string | null;
    };
    const store = this.ensureGitStore(key);
    store.commits[input.sha] ??= {
      treeSha: "unknown-tree",
      parents: [store.headSha],
      message: "fast-forward",
    };
    store.headSha = input.sha;
    entry.gitHeadSha = input.sha;
    entry.branchHeadSha = input.sha;
    return {
      ref: `refs/heads/${input.ref}`,
      object: { sha: input.sha },
    };
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
      const extended = entry as typeof entry & { fileContents?: Record<string, string> };
      extended.fileContents ??= {};
      extended.fileContents[input.path] = input.content;
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

  clearProvisioningFaults(): void {
    this.state.markerCommitError = null;
    this.state.markerCommitErrorsRemaining = 0;
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
