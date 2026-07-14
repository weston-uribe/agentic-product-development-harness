import { readFile } from "node:fs/promises";
import path from "node:path";
import { GitHubApiError } from "../github/client.js";
import { HARNESS_MANAGED_REPO_MARKER_FILE } from "./harness-managed-repo-marker.js";
import {
  buildHarnessSnapshotManagedRepoMarker,
  parseHarnessManagedRepoMarkerJson,
} from "./harness-managed-repo-marker.js";
import type { GitHubHarnessProvisioningProvider } from "./github-remote-provider.js";
import { parseRepoSlug } from "./github-remote-setup-live.js";
import type { HarnessProvisioningPendingState } from "./harness-provisioning-pending-state.js";
import type { WorkspaceSnapshotManifest } from "../p-dev/workspace-snapshot-types.js";
import { loadWorkspaceSnapshotEntryContent } from "../p-dev/workspace-snapshot-generator.js";

const DEFAULT_UPLOAD_CONCURRENCY = Number(
  process.env.HARNESS_SNAPSHOT_UPLOAD_CONCURRENCY ?? 4,
);
const MAX_UPLOAD_RETRIES = Number(process.env.HARNESS_SNAPSHOT_UPLOAD_RETRIES ?? 3);

export type SnapshotProvisioningPhase =
  | "repository-created"
  | "snapshot-objects-uploading"
  | "snapshot-commit-created"
  | "marker-pending"
  | "persistence-pending";

export interface SnapshotProvisioningProgress {
  phase: SnapshotProvisioningProgressPhase;
  uploadedBlobs: number;
  totalBlobs: number;
}

export type SnapshotProvisioningProgressPhase = SnapshotProvisioningPhase;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGitHubError(error: unknown): boolean {
  if (!(error instanceof GitHubApiError)) {
    return false;
  }
  if (error.status === 403 && /rate limit/i.test(error.message)) {
    return true;
  }
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (!isRetryableGitHubError(error) || attempt > MAX_UPLOAD_RETRIES) {
        throw error;
      }
      const delayMs = Math.min(8_000, 250 * 2 ** (attempt - 1));
      await sleep(delayMs + Math.floor(Math.random() * 100));
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await mapper(items[current]!, current);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function uploadSnapshotBlobs(input: {
  provider: GitHubHarnessProvisioningProvider;
  owner: string;
  repo: string;
  snapshotRoot: string;
  manifest: WorkspaceSnapshotManifest;
  onProgress?: (progress: SnapshotProvisioningProgress) => void;
}): Promise<Map<string, string>> {
  const blobShaByPath = new Map<string, string>();
  const files = input.manifest.files;
  input.onProgress?.({
    phase: "snapshot-objects-uploading",
    uploadedBlobs: 0,
    totalBlobs: files.length,
  });

  let uploaded = 0;
  await mapWithConcurrency(
    files,
    DEFAULT_UPLOAD_CONCURRENCY,
    async (file) => {
      const content = await loadWorkspaceSnapshotEntryContent({
        snapshotRoot: input.snapshotRoot,
        path: file.path,
        expectedSha256: file.sha256,
      });
      const blob = await withRetries(() =>
        input.provider.createGitBlob({
          owner: input.owner,
          repo: input.repo,
          content,
        }),
      );
      if (blob.sha !== file.gitBlobSha1) {
        throw new Error(
          `Uploaded blob SHA mismatch for ${file.path} (expected ${file.gitBlobSha1}, got ${blob.sha}).`,
        );
      }
      blobShaByPath.set(file.path, blob.sha);
      uploaded += 1;
      input.onProgress?.({
        phase: "snapshot-objects-uploading",
        uploadedBlobs: uploaded,
        totalBlobs: files.length,
      });
    },
  );

  return blobShaByPath;
}

export async function createSnapshotCommit(input: {
  provider: GitHubHarnessProvisioningProvider;
  owner: string;
  repo: string;
  manifest: WorkspaceSnapshotManifest;
  parentCommitSha: string;
  blobShaByPath: Map<string, string>;
}): Promise<string> {
  const tree = await withRetries(() =>
    input.provider.createGitTree({
      owner: input.owner,
      repo: input.repo,
      tree: input.manifest.files.map((file) => ({
        path: file.path,
        mode: file.mode,
        type: "blob",
        sha: input.blobShaByPath.get(file.path) ?? file.gitBlobSha1,
      })),
    }),
  );
  if (tree.sha !== input.manifest.gitRootTreeSha1) {
    throw new Error(
      `Snapshot tree SHA mismatch (expected ${input.manifest.gitRootTreeSha1}, got ${tree.sha}).`,
    );
  }
  const commit = await withRetries(() =>
    input.provider.createGitCommit({
      owner: input.owner,
      repo: input.repo,
      message: `Initialize p-dev harness workspace snapshot (${input.manifest.packageVersion})`,
      tree: tree.sha,
      parents: [input.parentCommitSha],
    }),
  );
  return commit.sha;
}

export async function createMarkerCommit(input: {
  provider: GitHubHarnessProvisioningProvider;
  owner: string;
  repo: string;
  defaultBranch: string;
  parentCommitSha: string;
  markerContent: string;
}): Promise<string> {
  const markerBlob = await withRetries(() =>
    input.provider.createGitBlob({
      owner: input.owner,
      repo: input.repo,
      content: Buffer.from(input.markerContent, "utf8"),
    }),
  );
  const markerTree = await withRetries(() =>
    input.provider.createGitTree({
      owner: input.owner,
      repo: input.repo,
      tree: [
        {
          path: HARNESS_MANAGED_REPO_MARKER_FILE,
          mode: "100644",
          type: "blob",
          sha: markerBlob.sha,
        },
      ],
    }),
  );
  const markerCommit = await withRetries(() =>
    input.provider.createGitCommit({
      owner: input.owner,
      repo: input.repo,
      message: "Initialize p-dev managed harness workspace marker",
      tree: markerTree.sha,
      parents: [input.parentCommitSha],
    }),
  );
  await withRetries(() =>
    input.provider.updateGitRef({
      owner: input.owner,
      repo: input.repo,
      ref: input.defaultBranch,
      sha: markerCommit.sha,
      force: false,
    }),
  );
  return markerCommit.sha;
}

export async function provisionHarnessWorkspaceFromSnapshot(input: {
  provider: GitHubHarnessProvisioningProvider;
  user: { id: number; login: string };
  repoName: string;
  description: string;
  snapshotRoot: string;
  manifest: WorkspaceSnapshotManifest;
  packageVersion: string;
  operationId: string;
  pending?: HarnessProvisioningPendingState | null;
  onProgress?: (progress: SnapshotProvisioningProgress) => void;
}): Promise<
  | {
      ok: true;
      fullName: string;
      repositoryId: number;
      defaultBranch: string;
      initializedCommitSha: string;
      snapshotCommitSha: string;
      markerCommitSha: string;
    }
  | { ok: false; message: string; recoverable: boolean }
> {
  const owner = input.user.login;
  const { repo } = parseRepoSlug(`${owner}/${input.repoName}`);

  let repositoryId = input.pending?.repositoryId;
  let defaultBranch = "main";
  let initializedCommitSha = input.pending?.initializedCommitSha;

  if (!repositoryId || !initializedCommitSha) {
    const created = await withRetries(() =>
      input.provider.createUserRepository({
        name: input.repoName,
        description: input.description,
        private: true,
        autoInit: true,
      }),
    );
    repositoryId = created.repositoryId;
    defaultBranch = created.defaultBranch;
    const headRef = await input.provider.getGitRef(owner, repo, defaultBranch);
    initializedCommitSha = headRef.object.sha;
    input.onProgress?.({
      phase: "repository-created",
      uploadedBlobs: 0,
      totalBlobs: input.manifest.fileCount,
    });
  }

  let snapshotCommitSha = input.pending?.snapshotCommitSha;
  if (!snapshotCommitSha) {
    const blobShaByPath = await uploadSnapshotBlobs({
      provider: input.provider,
      owner,
      repo,
      snapshotRoot: input.snapshotRoot,
      manifest: input.manifest,
      onProgress: input.onProgress,
    });
    snapshotCommitSha = await createSnapshotCommit({
      provider: input.provider,
      owner,
      repo,
      manifest: input.manifest,
      parentCommitSha: initializedCommitSha!,
      blobShaByPath,
    });
    await withRetries(() =>
      input.provider.updateGitRef({
        owner,
        repo,
        ref: defaultBranch,
        sha: snapshotCommitSha!,
        force: false,
      }),
    );
    input.onProgress?.({
      phase: "snapshot-commit-created",
      uploadedBlobs: input.manifest.fileCount,
      totalBlobs: input.manifest.fileCount,
    });
  }

  let markerCommitSha = input.pending?.markerCommitSha;
  if (!markerCommitSha) {
    const marker = buildHarnessSnapshotManagedRepoMarker({
      repository: `${owner}/${input.repoName}`,
      repositoryId: repositoryId!,
      manifest: input.manifest,
      snapshotCommitSha: snapshotCommitSha!,
      operationId: input.operationId,
      createdByGithubUserId: input.user.id,
      createdByLogin: input.user.login,
      pDevVersion: input.packageVersion,
      defaultBranch,
    });
    markerCommitSha = await createMarkerCommit({
      provider: input.provider,
      owner,
      repo,
      defaultBranch,
      parentCommitSha: snapshotCommitSha!,
      markerContent: `${JSON.stringify(marker, null, 2)}\n`,
    });
    input.onProgress?.({
      phase: "marker-pending",
      uploadedBlobs: input.manifest.fileCount,
      totalBlobs: input.manifest.fileCount,
    });
  }

  return {
    ok: true,
    fullName: `${owner}/${input.repoName}`,
    repositoryId: repositoryId!,
    defaultBranch,
    initializedCommitSha: initializedCommitSha!,
    snapshotCommitSha: snapshotCommitSha!,
    markerCommitSha: markerCommitSha!,
  };
}

export async function verifyProvisionedHarnessWorkspace(input: {
  provider: GitHubHarnessProvisioningProvider;
  repoSlug: string;
  repositoryId: number;
  manifest: WorkspaceSnapshotManifest;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { owner, repo } = parseRepoSlug(input.repoSlug);
  const metadata = await input.provider.getRepositoryMetadata(owner, repo);
  if (!metadata) {
    return { ok: false, message: `Harness workspace ${input.repoSlug} is not accessible.` };
  }
  if (metadata.repositoryId !== input.repositoryId) {
    return {
      ok: false,
      message: `Harness workspace repository ID mismatch for ${input.repoSlug}.`,
    };
  }
  if (!metadata.private || !metadata.permissions.admin) {
    return {
      ok: false,
      message: `Harness workspace ${input.repoSlug} must be private and admin-accessible.`,
    };
  }

  const headSha = await input.provider.getRepositoryDefaultBranchHead(
    owner,
    repo,
    metadata.defaultBranch,
  );
  const markerRaw = await input.provider.readRepositoryFileContent(
    owner,
    repo,
    HARNESS_MANAGED_REPO_MARKER_FILE,
    headSha,
  );
  if (!markerRaw) {
    return { ok: false, message: "Provisioned workspace is missing the managed marker at HEAD." };
  }
  const marker = parseHarnessManagedRepoMarkerJson(markerRaw);
  if (!marker.ok) {
    return { ok: false, message: marker.reason };
  }
  if (!marker.marker.createdFromPackageSnapshot) {
    return {
      ok: false,
      message: "Provisioned workspace marker is not snapshot-backed.",
    };
  }
  const provenance = marker.marker.createdFromPackageSnapshot;
  if (
    provenance.snapshotContentId !== input.manifest.snapshotContentId ||
    provenance.snapshotSha256 !== input.manifest.snapshotSha256 ||
    provenance.snapshotGitTreeSha1 !== input.manifest.gitRootTreeSha1 ||
    provenance.sourceCommit !== input.manifest.sourceCommit
  ) {
    return {
      ok: false,
      message: "Provisioned workspace marker provenance does not match embedded manifest.",
    };
  }

  const headCommit = await input.provider.getGitCommit(owner, repo, headSha);
  const parentSha = headCommit.parents[0]?.sha;
  if (!parentSha) {
    return { ok: false, message: "Marker commit is missing a parent snapshot commit." };
  }
  const parentCommit = await input.provider.getGitCommit(owner, repo, parentSha);
  if (parentCommit.tree.sha !== input.manifest.gitRootTreeSha1) {
    return {
      ok: false,
      message: "Snapshot commit tree does not match embedded manifest.",
    };
  }
  return { ok: true };
}

export async function loadSnapshotFileContent(
  snapshotRoot: string,
  snapshotPath: string,
  expectedSha256: string,
): Promise<Buffer> {
  return loadWorkspaceSnapshotEntryContent({
    snapshotRoot,
    path: snapshotPath,
    expectedSha256: expectedSha256,
  });
}

export async function readSnapshotManifestFromPackage(
  snapshotRoot: string,
): Promise<WorkspaceSnapshotManifest> {
  const raw = await readFile(path.join(snapshotRoot, "manifest.json"), "utf8");
  const parsed = JSON.parse(raw) as WorkspaceSnapshotManifest;
  return parsed;
}
