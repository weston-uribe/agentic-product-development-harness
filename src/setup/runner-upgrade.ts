import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceSnapshotManifest } from "../p-dev/workspace-snapshot-types.js";
import {
  isIncludedSnapshotPath,
  isForbiddenSnapshotPath,
} from "../p-dev/workspace-snapshot-policy.js";
import { loadWorkspaceSnapshotEntryContent } from "../p-dev/workspace-snapshot-generator.js";
import { loadEmbeddedWorkspaceSnapshot } from "./harness-workspace-snapshot-loader.js";
import {
  HARNESS_MANAGED_REPO_MARKER_FILE,
  buildHarnessSnapshotManagedRepoMarker,
  parseHarnessManagedRepoMarkerJson,
  validateManagedMarkerForReconnect,
  type HarnessManagedRepoMarker,
} from "./harness-managed-repo-marker.js";
import { formatHarnessDispatchRepo, resolveHarnessDispatchRepo } from "./harness-dispatch-repo.js";
import { deriveProvisioningCommitIdentity } from "./harness-snapshot-provisioning-helpers.js";
import { syncHarnessConfigCloudPair } from "./sync-harness-config-cloud.js";
import { recordRunnerUpgradeEvidence } from "./runner-upgrade-evidence.js";
import {
  clearRunnerUpgradePendingState,
  readRunnerUpgradePendingState,
  withHarnessRunnerUpgradeMutex,
  writeRunnerUpgradePendingStateAtomic,
  type RunnerUpgradePendingState,
} from "./runner-upgrade-pending-state.js";
import { writeRunnerUpgradeProgressAtomic } from "./runner-upgrade-progress.js";
import {
  compareThreeWayUpgrade,
  extractFileHashesFromManifest,
  extractFileHashesFromMarker,
  type FileHashMap,
} from "./runner-upgrade-three-way.js";
import {
  asRemoteSetupProviderForRunnerUpgrade,
  type RunnerUpgradeGitHubProvider,
} from "./runner-upgrade-provider.js";
import {
  RUNNER_UPGRADE_CANARY_WORKFLOW_PATH,
  buildRunnerUpgradeBranchName,
  buildRunnerUpgradePrMarker,
  parseRunnerUpgradePrMarker,
  runnerUpgradeStatusLabel,
  type RunnerUpgradeApplyResult,
  type RunnerUpgradeImpactSummary,
  type RunnerUpgradePhase,
  type RunnerUpgradePreviewResult,
  type RunnerUpgradeSnapshotSummary,
  type RunnerUpgradeStatus,
  type RunnerUpgradeStatusResult,
} from "./runner-upgrade-types.js";

const ALL_RUNNER_UPGRADE_PHASES: RunnerUpgradePhase[] = [
  "verifying-managed-repository",
  "comparing-runner-snapshots",
  "preparing-upgrade-commit",
  "updating-managed-runner",
  "verifying-runner-on-production-branch",
  "synchronizing-cloud-configuration",
  "running-configuration-canary",
];

const DEFAULT_CANARY_POLL_INTERVAL_MS = 2_000;
const DEFAULT_CANARY_POLL_TIMEOUT_MS = 120_000;

const OPERATOR_LOCAL_ONLY_PATHS = new Set([
  ".harness/config.local.json",
  ".env.local",
]);

export interface RunnerUpgradeApplyOptions {
  previewFingerprint?: string;
  canaryPollIntervalMs?: number;
  canaryPollTimeoutMs?: number;
}

interface ResolvedRunnerUpgradeContext {
  repoSlug: string;
  owner: string;
  repo: string;
  repositoryId: number;
  defaultBranch: string;
  defaultBranchHead: string;
  marker: HarnessManagedRepoMarker;
  packagedSnapshot: {
    packageRoot: string;
    snapshotRoot: string;
    packageVersion: string;
    manifest: WorkspaceSnapshotManifest;
    fingerprint: string;
  };
}

function sha256Content(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function snapshotSummaryFromManifest(
  manifest: WorkspaceSnapshotManifest,
): RunnerUpgradeSnapshotSummary {
  return {
    snapshotContentId: manifest.snapshotContentId,
    packageVersion: manifest.packageVersion,
    sourceCommit: manifest.sourceCommit,
  };
}

function buildImpactSummary(input: {
  replacePaths: string[];
  deletePaths: string[];
}): RunnerUpgradeImpactSummary {
  return {
    replacePathCount: input.replacePaths.length,
    deletePathCount: input.deletePaths.length,
    sampleReplacePaths: input.replacePaths.slice(0, 8),
    sampleDeletePaths: input.deletePaths.slice(0, 8),
  };
}

function computePreviewFingerprint(input: {
  targetSnapshotContentId: string;
  replacePaths: string[];
  deletePaths: string[];
  repositoryId: number;
}): string {
  return sha256Content(
    JSON.stringify({
      targetSnapshotContentId: input.targetSnapshotContentId,
      replacePaths: [...input.replacePaths].sort(),
      deletePaths: [...input.deletePaths].sort(),
      repositoryId: input.repositoryId,
    }),
  );
}

function isOperatorLocalOnlyPath(filePath: string): boolean {
  if (OPERATOR_LOCAL_ONLY_PATHS.has(filePath)) {
    return true;
  }
  return isForbiddenSnapshotPath(filePath);
}

function findUnexpectedRemotePaths(input: {
  remoteTreePaths: string[];
  nextHashes: FileHashMap;
  previousHashes: FileHashMap | null;
}): string[] {
  const packagePaths = new Set(Object.keys(input.nextHashes));
  const unexpected: string[] = [];
  for (const remotePath of input.remoteTreePaths) {
    if (remotePath === HARNESS_MANAGED_REPO_MARKER_FILE) {
      continue;
    }
    if (!isIncludedSnapshotPath(remotePath)) {
      continue;
    }
    if (packagePaths.has(remotePath)) {
      continue;
    }
    if (isOperatorLocalOnlyPath(remotePath)) {
      continue;
    }
    if (input.previousHashes?.[remotePath]) {
      continue;
    }
    unexpected.push(remotePath);
  }
  return [...new Set(unexpected)].sort();
}

async function resolveHarnessRepository(cwd?: string): Promise<{
  repoSlug: string;
  owner: string;
  repo: string;
}> {
  const harnessDispatchRepo = await resolveHarnessDispatchRepo({ cwd });
  if (!harnessDispatchRepo.resolved || !harnessDispatchRepo.repo) {
    throw new Error("Harness dispatch repository is not configured.");
  }
  const repoSlug = formatHarnessDispatchRepo(harnessDispatchRepo);
  const [owner, repo] = repoSlug.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid harness repository slug ${repoSlug}.`);
  }
  return { repoSlug, owner, repo };
}

async function loadPackagedSnapshot(): Promise<
  ResolvedRunnerUpgradeContext["packagedSnapshot"] | null
> {
  const embedded = await loadEmbeddedWorkspaceSnapshot(import.meta.url);
  if (!embedded.ok) {
    return null;
  }
  return {
    packageRoot: embedded.packageRoot,
    snapshotRoot: embedded.snapshotRoot,
    packageVersion: embedded.packageVersion,
    manifest: embedded.manifest,
    fingerprint: embedded.fingerprint,
  };
}

async function readRemoteManagedMarker(
  provider: RunnerUpgradeGitHubProvider,
  input: {
    owner: string;
    repo: string;
    defaultBranch: string;
    defaultBranchHead: string;
  },
): Promise<
  | { ok: true; marker: HarnessManagedRepoMarker }
  | { ok: false; status: RunnerUpgradeStatus; reason: string }
> {
  const raw = await provider.readRepositoryFileContent(
    input.owner,
    input.repo,
    HARNESS_MANAGED_REPO_MARKER_FILE,
    input.defaultBranchHead,
  );
  if (!raw) {
    return {
      ok: false,
      status: "blocked_non_managed",
      reason: "Managed repository marker is missing on the default branch.",
    };
  }
  const parsed = parseHarnessManagedRepoMarkerJson(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      status: "blocked_non_managed",
      reason: parsed.reason,
    };
  }
  if (!parsed.marker.createdFromPackageSnapshot) {
    return {
      ok: false,
      status: "blocked_non_managed",
      reason: "Managed repository was not created from a packaged workspace snapshot.",
    };
  }
  return { ok: true, marker: parsed.marker };
}

async function buildRemoteFileHashes(
  provider: RunnerUpgradeGitHubProvider,
  input: {
    owner: string;
    repo: string;
    defaultBranchHead: string;
    paths: string[];
  },
): Promise<FileHashMap> {
  const hashes: FileHashMap = {};
  for (const filePath of input.paths) {
    const content = await provider.readRepositoryFileContent(
      input.owner,
      input.repo,
      filePath,
      input.defaultBranchHead,
    );
    if (content === null) {
      continue;
    }
    hashes[filePath] = sha256Content(content);
  }
  return hashes;
}

async function resolveRunnerUpgradeContext(
  cwd: string | undefined,
  provider: RunnerUpgradeGitHubProvider,
): Promise<
  | { ok: true; context: ResolvedRunnerUpgradeContext }
  | { ok: false; result: RunnerUpgradeStatusResult }
> {
  const packagedSnapshot = await loadPackagedSnapshot();
  if (!packagedSnapshot) {
    return {
      ok: false,
      result: {
        status: "failed",
        statusLabel: runnerUpgradeStatusLabel("failed"),
        blockedReason: "Embedded workspace snapshot is unavailable.",
      },
    };
  }

  const { repoSlug, owner, repo } = await resolveHarnessRepository(cwd);
  const metadata = await provider.getRepositoryMetadata(owner, repo);
  if (!metadata) {
    return {
      ok: false,
      result: {
        status: "failed",
        statusLabel: runnerUpgradeStatusLabel("failed"),
        blockedReason: `Harness repository ${repoSlug} is not accessible.`,
      },
    };
  }

  const defaultBranchHead = await provider.getRepositoryDefaultBranchHead(
    owner,
    repo,
    metadata.defaultBranch,
  );
  const markerResult = await readRemoteManagedMarker(provider, {
    owner,
    repo,
    defaultBranch: metadata.defaultBranch,
    defaultBranchHead,
  });
  if (!markerResult.ok) {
    return {
      ok: false,
      result: {
        status: markerResult.status,
        statusLabel: runnerUpgradeStatusLabel(markerResult.status),
        blockedReason: markerResult.reason,
        availableSnapshot: snapshotSummaryFromManifest(packagedSnapshot.manifest),
      },
    };
  }

  const reconnect = validateManagedMarkerForReconnect(
    markerResult.marker,
    repoSlug,
    { repositoryId: metadata.id },
  );
  if (!reconnect.ok) {
    return {
      ok: false,
      result: {
        status: "blocked_non_managed",
        statusLabel: runnerUpgradeStatusLabel("blocked_non_managed"),
        blockedReason: reconnect.reason,
        currentSnapshot: markerResult.marker.createdFromPackageSnapshot
          ? {
              snapshotContentId:
                markerResult.marker.createdFromPackageSnapshot.snapshotContentId,
              packageVersion:
                markerResult.marker.createdFromPackageSnapshot.packageVersion,
              sourceCommit:
                markerResult.marker.createdFromPackageSnapshot.sourceCommit,
            }
          : undefined,
        availableSnapshot: snapshotSummaryFromManifest(packagedSnapshot.manifest),
      },
    };
  }

  return {
    ok: true,
    context: {
      repoSlug,
      owner,
      repo,
      repositoryId: metadata.id,
      defaultBranch: metadata.defaultBranch,
      defaultBranchHead,
      marker: markerResult.marker,
      packagedSnapshot,
    },
  };
}

async function writeProgress(
  cwd: string | undefined,
  pending: RunnerUpgradePendingState,
  phase: RunnerUpgradePhase,
): Promise<void> {
  await writeRunnerUpgradeProgressAtomic(
    {
      operationId: pending.operationId,
      phase,
      phaseStartedAt: new Date().toISOString(),
      startedAt: pending.startedAt,
      canaryRunId: pending.canaryRunId,
      canaryRunUrl: pending.canaryRunUrl,
      prUrl: pending.prUrl,
    },
    cwd,
  );
}

async function compareUpgradeSnapshots(
  provider: RunnerUpgradeGitHubProvider,
  context: ResolvedRunnerUpgradeContext,
): Promise<
  | {
      ok: true;
      previousHashes: FileHashMap | null;
      remoteHashes: FileHashMap;
      nextHashes: FileHashMap;
      replacePaths: string[];
      deletePaths: string[];
      previewFingerprint: string;
    }
  | {
      ok: false;
      status: RunnerUpgradeStatus;
      conflictPaths?: string[];
      message: string;
    }
> {
  const previousHashes = extractFileHashesFromMarker(context.marker);
  const nextHashes = extractFileHashesFromManifest(context.packagedSnapshot.manifest);
  const comparePaths = [
    ...new Set([
      ...Object.keys(previousHashes ?? {}),
      ...Object.keys(nextHashes),
    ]),
  ].sort();
  const remoteHashes = await buildRemoteFileHashes(provider, {
    owner: context.owner,
    repo: context.repo,
    defaultBranchHead: context.defaultBranchHead,
    paths: comparePaths,
  });

  if (provider.listRepositoryTreePaths) {
    const treePaths = await provider.listRepositoryTreePaths(
      context.owner,
      context.repo,
      context.defaultBranchHead,
    );
    const unexpected = findUnexpectedRemotePaths({
      remoteTreePaths: treePaths.map((entry) => entry.path),
      nextHashes,
      previousHashes,
    });
    if (unexpected.length > 0) {
      return {
        ok: false,
        status: "blocked_unexpected_remote",
        message: `Unexpected remote paths outside packaged policy: ${unexpected.join(", ")}`,
      };
    }
  }

  const compare = compareThreeWayUpgrade({
    previousHashes,
    remoteHashes,
    nextHashes,
    previousSnapshotContentId:
      context.marker.createdFromPackageSnapshot?.snapshotContentId,
    remoteSnapshotContentId:
      context.marker.createdFromPackageSnapshot?.snapshotContentId,
    remoteTreeSha: context.marker.createdFromPackageSnapshot?.snapshotGitTreeSha1,
    previousTreeSha: context.marker.createdFromPackageSnapshot?.snapshotGitTreeSha1,
  });

  if (!compare.ok) {
    return {
      ok: false,
      status:
        compare.code === "operator_conflicts"
          ? "blocked_operator_conflicts"
          : "blocked_non_managed",
      conflictPaths: compare.conflictPaths,
      message: compare.message,
    };
  }

  const previewFingerprint = computePreviewFingerprint({
    targetSnapshotContentId: context.packagedSnapshot.manifest.snapshotContentId,
    replacePaths: compare.replacePaths,
    deletePaths: compare.deletePaths,
    repositoryId: context.repositoryId,
  });

  return {
    ok: true,
    previousHashes,
    remoteHashes,
    nextHashes,
    replacePaths: compare.replacePaths,
    deletePaths: compare.deletePaths,
    previewFingerprint,
  };
}

async function findExistingUpgradePullRequest(
  provider: RunnerUpgradeGitHubProvider,
  input: {
    owner: string;
    repo: string;
    repositoryId: number;
    snapshotContentId: string;
    defaultBranch: string;
    branchName: string;
  },
): Promise<{ number: number; htmlUrl: string; headSha: string } | null> {
  const openPulls = await provider.listPullRequests(input.owner, input.repo, {
    state: "open",
    base: input.defaultBranch,
  });
  for (const pull of openPulls) {
    const marker = parseRunnerUpgradePrMarker(pull.body);
    if (
      marker &&
      marker.repositoryId === input.repositoryId &&
      marker.snapshotContentId === input.snapshotContentId
    ) {
      return {
        number: pull.number,
        htmlUrl: pull.htmlUrl,
        headSha: pull.headSha,
      };
    }
  }
  const byBranch = openPulls.find((pull) => pull.headRef === input.branchName);
  if (byBranch) {
    return {
      number: byBranch.number,
      htmlUrl: byBranch.htmlUrl,
      headSha: byBranch.headSha,
    };
  }
  return null;
}

async function buildUpgradeCommitOnBranch(
  provider: RunnerUpgradeGitHubProvider,
  context: ResolvedRunnerUpgradeContext,
  input: {
    operationId: string;
    branchName: string;
    replacePaths: string[];
    deletePaths: string[];
  },
): Promise<{ commitSha: string; headSha: string }> {
  const parentSha = context.defaultBranchHead;
  const parentCommit = await provider.getGitCommit(
    context.owner,
    context.repo,
    parentSha,
  );
  const parentTreeSha = parentCommit.tree.sha;
  const manifest = context.packagedSnapshot.manifest;
  const blobShaByPath = new Map<string, string>();

  for (const filePath of input.replacePaths) {
    const manifestFile = manifest.files.find((file) => file.path === filePath);
    if (!manifestFile) {
      throw new Error(`Packaged snapshot is missing ${filePath}.`);
    }
    const content = await loadWorkspaceSnapshotEntryContent({
      snapshotRoot: context.packagedSnapshot.snapshotRoot,
      path: filePath,
      expectedSha256: manifestFile.sha256,
    });
    const blob = await provider.createGitBlob({
      owner: context.owner,
      repo: context.repo,
      content,
    });
    blobShaByPath.set(filePath, blob.sha);
  }

  const markerContent = JSON.stringify(
    buildHarnessSnapshotManagedRepoMarker({
      repository: context.repoSlug,
      repositoryId: context.repositoryId,
      manifest,
      snapshotCommitSha: "pending",
      defaultBranch: context.defaultBranch,
      operationId: input.operationId,
      pDevVersion: context.packagedSnapshot.packageVersion,
    }),
    null,
    2,
  );
  const markerBlob = await provider.createGitBlob({
    owner: context.owner,
    repo: context.repo,
    content: Buffer.from(`${markerContent}\n`, "utf8"),
  });
  blobShaByPath.set(HARNESS_MANAGED_REPO_MARKER_FILE, markerBlob.sha);

  const treeEntries = [
    ...input.replacePaths.map((filePath) => {
      const manifestFile = manifest.files.find((file) => file.path === filePath);
      return {
        path: filePath,
        mode: manifestFile?.mode ?? "100644",
        type: "blob" as const,
        sha: blobShaByPath.get(filePath)!,
      };
    }),
    ...input.deletePaths.map((filePath) => ({
      path: filePath,
      mode: "100644",
      type: "blob" as const,
      sha: null as unknown as string,
    })),
    {
      path: HARNESS_MANAGED_REPO_MARKER_FILE,
      mode: "100644",
      type: "blob" as const,
      sha: markerBlob.sha,
    },
  ];

  const tree = await provider.createGitTree({
    owner: context.owner,
    repo: context.repo,
    baseTree: parentTreeSha,
    tree: treeEntries,
  });

  const commitIdentity = deriveProvisioningCommitIdentity({
    operationId: input.operationId,
    sourceCommit: manifest.sourceCommit,
  });
  const commit = await provider.createGitCommit({
    owner: context.owner,
    repo: context.repo,
    message: `Update p-dev runner to ${manifest.packageVersion}`,
    tree: tree.sha,
    parents: [parentSha],
    author: commitIdentity,
    committer: commitIdentity,
  });

  let branchHeadSha: string | null = null;
  try {
    const existingRef = await provider.getGitRef(
      context.owner,
      context.repo,
      input.branchName,
    );
    branchHeadSha = existingRef.object.sha;
  } catch {
    branchHeadSha = null;
  }

  if (branchHeadSha) {
    await provider.updateGitRef({
      owner: context.owner,
      repo: context.repo,
      ref: input.branchName,
      sha: commit.sha,
      expectedSha: branchHeadSha,
    });
  } else if (provider.createGitRef) {
    await provider.createGitRef({
      owner: context.owner,
      repo: context.repo,
      ref: input.branchName,
      sha: commit.sha,
    });
  } else {
    await provider.updateGitRef({
      owner: context.owner,
      repo: context.repo,
      ref: input.branchName,
      sha: commit.sha,
    });
  }

  return { commitSha: commit.sha, headSha: commit.sha };
}

async function verifyProductionMarker(
  provider: RunnerUpgradeGitHubProvider,
  context: ResolvedRunnerUpgradeContext,
  targetSnapshotContentId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const headSha = await provider.getRepositoryDefaultBranchHead(
    context.owner,
    context.repo,
    context.defaultBranch,
  );
  const raw = await provider.readRepositoryFileContent(
    context.owner,
    context.repo,
    HARNESS_MANAGED_REPO_MARKER_FILE,
    headSha,
  );
  if (!raw) {
    return { ok: false, message: "Production marker is missing after merge." };
  }
  const parsed = parseHarnessManagedRepoMarkerJson(raw);
  if (!parsed.ok) {
    return { ok: false, message: parsed.reason };
  }
  const remoteSnapshotContentId =
    parsed.marker.createdFromPackageSnapshot?.snapshotContentId;
  if (remoteSnapshotContentId !== targetSnapshotContentId) {
    return {
      ok: false,
      message: `Production marker snapshotContentId mismatch (expected ${targetSnapshotContentId}, found ${remoteSnapshotContentId ?? "none"}).`,
    };
  }
  const remoteHashes = extractFileHashesFromMarker(parsed.marker);
  if (remoteHashes) {
    const nextHashes = extractFileHashesFromManifest(context.packagedSnapshot.manifest);
    for (const [filePath, expectedHash] of Object.entries(nextHashes)) {
      if (remoteHashes[filePath] !== expectedHash) {
        return {
          ok: false,
          message: `Production marker file hash mismatch for ${filePath}.`,
        };
      }
    }
  }
  return { ok: true };
}

async function pollCanaryRun(
  provider: RunnerUpgradeGitHubProvider,
  input: {
    owner: string;
    repo: string;
    runId: number;
    pollIntervalMs: number;
    pollTimeoutMs: number;
  },
): Promise<{ ok: true; run: { htmlUrl: string } } | { ok: false; message: string }> {
  const started = Date.now();
  while (Date.now() - started < input.pollTimeoutMs) {
    const run = await provider.getWorkflowRun(input.owner, input.repo, input.runId);
    if (run.status === "completed") {
      if (run.conclusion === "success") {
        return { ok: true, run: { htmlUrl: run.htmlUrl } };
      }
      return {
        ok: false,
        message: `Configuration canary failed with conclusion ${run.conclusion ?? "unknown"}.`,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
  }
  return { ok: false, message: "Configuration canary timed out." };
}

export async function loadRunnerUpgradeStatus(
  cwd: string | undefined,
  provider: RunnerUpgradeGitHubProvider,
): Promise<RunnerUpgradeStatusResult> {
  const pending = await readRunnerUpgradePendingState(cwd);
  if (pending?.syncInProgress || pending?.phase === "running-configuration-canary") {
    return {
      status: pending.codeUpdateComplete ? "partially_updated" : "updating",
      statusLabel: runnerUpgradeStatusLabel(
        pending.codeUpdateComplete ? "partially_updated" : "updating",
      ),
      pendingOperationId: pending.operationId,
      pendingPhase: pending.phase,
      prUrl: pending.prUrl,
      canaryRunUrl: pending.canaryRunUrl,
    };
  }
  if (pending && pending.lastError) {
    return {
      status: pending.codeUpdateComplete ? "partially_updated" : "failed",
      statusLabel: runnerUpgradeStatusLabel(
        pending.codeUpdateComplete ? "partially_updated" : "failed",
      ),
      pendingOperationId: pending.operationId,
      pendingPhase: pending.phase,
      blockedReason: pending.lastError,
      conflictPaths: pending.conflictPaths,
      prUrl: pending.prUrl,
      canaryRunUrl: pending.canaryRunUrl,
    };
  }

  const resolved = await resolveRunnerUpgradeContext(cwd, provider);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { context } = resolved;
  const currentSnapshot = snapshotSummaryFromManifest(
    context.marker.createdFromPackageSnapshot
      ? {
          ...context.packagedSnapshot.manifest,
          snapshotContentId:
            context.marker.createdFromPackageSnapshot.snapshotContentId,
          packageVersion:
            context.marker.createdFromPackageSnapshot.packageVersion,
          sourceCommit: context.marker.createdFromPackageSnapshot.sourceCommit,
        }
      : context.packagedSnapshot.manifest,
  );
  const availableSnapshot = snapshotSummaryFromManifest(
    context.packagedSnapshot.manifest,
  );

  if (
    currentSnapshot.snapshotContentId === availableSnapshot.snapshotContentId
  ) {
    return {
      status: "up_to_date",
      statusLabel: runnerUpgradeStatusLabel("up_to_date"),
      currentSnapshot,
      availableSnapshot,
    };
  }

  return {
    status: "update_available",
    statusLabel: runnerUpgradeStatusLabel("update_available"),
    currentSnapshot,
    availableSnapshot,
  };
}

export async function previewRunnerUpgrade(
  cwd: string | undefined,
  provider: RunnerUpgradeGitHubProvider,
): Promise<RunnerUpgradePreviewResult> {
  const resolved = await resolveRunnerUpgradeContext(cwd, provider);
  if (!resolved.ok) {
    return {
      previewFingerprint: "",
      targetSnapshotContentId: "",
      phases: ALL_RUNNER_UPGRADE_PHASES,
      blocked: true,
      blockedStatus: resolved.result.status,
      message: resolved.result.blockedReason,
      impact: {
        replacePathCount: 0,
        deletePathCount: 0,
        sampleReplacePaths: [],
        sampleDeletePaths: [],
      },
    };
  }

  const compare = await compareUpgradeSnapshots(provider, resolved.context);
  if (!compare.ok) {
    return {
      previewFingerprint: "",
      targetSnapshotContentId:
        resolved.context.packagedSnapshot.manifest.snapshotContentId,
      currentSnapshotContentId:
        resolved.context.marker.createdFromPackageSnapshot?.snapshotContentId,
      phases: ALL_RUNNER_UPGRADE_PHASES,
      blocked: true,
      blockedStatus: compare.status,
      conflictPaths: compare.conflictPaths,
      message: compare.message,
      impact: {
        replacePathCount: 0,
        deletePathCount: 0,
        sampleReplacePaths: [],
        sampleDeletePaths: [],
      },
    };
  }

  return {
    previewFingerprint: compare.previewFingerprint,
    targetSnapshotContentId:
      resolved.context.packagedSnapshot.manifest.snapshotContentId,
    currentSnapshotContentId:
      resolved.context.marker.createdFromPackageSnapshot?.snapshotContentId,
    impact: buildImpactSummary({
      replacePaths: compare.replacePaths,
      deletePaths: compare.deletePaths,
    }),
    phases: ALL_RUNNER_UPGRADE_PHASES,
  };
}

async function applyRunnerUpgradeInternal(
  cwd: string | undefined,
  provider: RunnerUpgradeGitHubProvider,
  options: RunnerUpgradeApplyOptions = {},
): Promise<RunnerUpgradeApplyResult> {
  let pending = await readRunnerUpgradePendingState(cwd);
  const startedAt = pending?.startedAt ?? new Date().toISOString();
  const operationId = pending?.operationId ?? randomUUID();

  const resolved = await resolveRunnerUpgradeContext(cwd, provider);
  if (!resolved.ok) {
    return {
      operationId,
      status: resolved.result.status,
      phase: "verifying-managed-repository",
      previewFingerprint: pending?.previewFingerprint ?? "",
      message: resolved.result.blockedReason,
    };
  }
  const context = resolved.context;

  if (
    context.marker.createdFromPackageSnapshot?.snapshotContentId ===
      context.packagedSnapshot.manifest.snapshotContentId &&
    !pending?.codeUpdateComplete
  ) {
    return {
      operationId,
      status: "up_to_date",
      phase: "verifying-managed-repository",
      previewFingerprint: pending?.previewFingerprint ?? "",
      message: "Runner is already up to date.",
    };
  }

  let compare:
    | Awaited<ReturnType<typeof compareUpgradeSnapshots>>
    | null = null;
  if (!pending?.codeUpdateComplete) {
    compare = await compareUpgradeSnapshots(provider, context);
    if (!compare.ok) {
      const failedPending: RunnerUpgradePendingState = {
        operationId,
        repositoryId: context.repositoryId,
        repoSlug: context.repoSlug,
        defaultBranch: context.defaultBranch,
        targetSnapshotContentId:
          context.packagedSnapshot.manifest.snapshotContentId,
        phase: "comparing-runner-snapshots",
        startedAt,
        previewFingerprint: pending?.previewFingerprint ?? "",
        syncInProgress: false,
        codeUpdateComplete: false,
        conflictPaths: compare.conflictPaths,
        lastError: compare.message,
      };
      await writeRunnerUpgradePendingStateAtomic(failedPending, cwd);
      await writeProgress(cwd, failedPending, failedPending.phase);
      return {
        operationId,
        status: compare.status,
        phase: "comparing-runner-snapshots",
        previewFingerprint: failedPending.previewFingerprint,
        message: compare.message,
      };
    }
    if (
      options.previewFingerprint &&
      options.previewFingerprint !== compare.previewFingerprint
    ) {
      return {
        operationId,
        status: "failed",
        phase: "comparing-runner-snapshots",
        previewFingerprint: compare.previewFingerprint,
        message: "Preview fingerprint mismatch; re-run preview before applying.",
      };
    }
  }

  const previewFingerprint =
    pending?.previewFingerprint ?? compare?.previewFingerprint ?? "";
  const branchName =
    pending?.branchName ??
    buildRunnerUpgradeBranchName(
      context.packagedSnapshot.manifest.snapshotContentId,
    );
  const targetSnapshotContentId =
    context.packagedSnapshot.manifest.snapshotContentId;

  pending = {
    operationId,
    repositoryId: context.repositoryId,
    repoSlug: context.repoSlug,
    defaultBranch: context.defaultBranch,
    targetSnapshotContentId,
    expectedFingerprint: pending?.expectedFingerprint,
    phase: pending?.codeUpdateComplete
      ? pending.phase
      : "verifying-managed-repository",
    startedAt,
    previewFingerprint,
    syncInProgress: pending?.syncInProgress ?? false,
    codeUpdateComplete: pending?.codeUpdateComplete ?? false,
    canaryRunId: pending?.canaryRunId,
    canaryRunUrl: pending?.canaryRunUrl,
    branchName,
    prUrl: pending?.prUrl,
    prNumber: pending?.prNumber,
  };
  await writeRunnerUpgradePendingStateAtomic(pending, cwd);
  await writeProgress(cwd, pending, pending.phase);

  if (!pending.codeUpdateComplete) {
    pending.phase = "comparing-runner-snapshots";
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);

    pending.phase = "preparing-upgrade-commit";
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);

    const upgradeCommit = await buildUpgradeCommitOnBranch(provider, context, {
      operationId,
      branchName,
      replacePaths: compare!.replacePaths,
      deletePaths: compare!.deletePaths,
    });

    pending.phase = "updating-managed-runner";
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);

    let pr = await findExistingUpgradePullRequest(provider, {
      owner: context.owner,
      repo: context.repo,
      repositoryId: context.repositoryId,
      snapshotContentId: targetSnapshotContentId,
      defaultBranch: context.defaultBranch,
      branchName,
    });

    if (!pr) {
      const created = await provider.createPullRequest({
        owner: context.owner,
        repo: context.repo,
        title: `Update p-dev runner to ${context.packagedSnapshot.packageVersion}`,
        head: branchName,
        base: context.defaultBranch,
        body: [
          buildRunnerUpgradePrMarker(context.repositoryId, targetSnapshotContentId),
          "",
          `Updates the managed p-dev runner workspace to package ${context.packagedSnapshot.packageVersion}.`,
        ].join("\n"),
      });
      pr = {
        number: created.number,
        htmlUrl: created.htmlUrl,
        headSha: upgradeCommit.headSha,
      };
    }

    pending.prUrl = pr.htmlUrl;
    pending.prNumber = pr.number;
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);

    const latestHeadRef = await provider.getGitRef(
      context.owner,
      context.repo,
      branchName,
    );
    const mergeHeadSha = latestHeadRef.object.sha;

    await provider.mergePullRequest(context.owner, context.repo, pr.number, {
      mergeMethod: "squash",
      commitTitle: `Update p-dev runner to ${context.packagedSnapshot.packageVersion}`,
      expectedHeadSha: mergeHeadSha,
    });

    pending.phase = "verifying-runner-on-production-branch";
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);

    const productionCheck = await verifyProductionMarker(
      provider,
      context,
      targetSnapshotContentId,
    );
    if (!productionCheck.ok) {
      pending.lastError = productionCheck.message;
      pending.phase = "verifying-runner-on-production-branch";
      await writeRunnerUpgradePendingStateAtomic(pending, cwd);
      await writeProgress(cwd, pending, pending.phase);
      return {
        operationId,
        status: "failed",
        phase: pending.phase,
        previewFingerprint,
        prUrl: pending.prUrl,
        prNumber: pending.prNumber,
        branchName,
        message: productionCheck.message,
      };
    }

    pending.codeUpdateComplete = true;
    pending.phase = "synchronizing-cloud-configuration";
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);
  }

  pending.syncInProgress = true;
  pending.phase = "synchronizing-cloud-configuration";
  await writeRunnerUpgradePendingStateAtomic(pending, cwd);
  await writeProgress(cwd, pending, pending.phase);

  try {
    const syncResult = await syncHarnessConfigCloudPair({
      cwd,
      provider: asRemoteSetupProviderForRunnerUpgrade(provider),
      harnessRepository: context.repoSlug,
    });
    pending.expectedFingerprint = syncResult.fingerprint;
  } catch (error) {
    pending.lastError =
      error instanceof Error ? error.message : "Cloud configuration sync failed.";
    pending.syncInProgress = false;
    pending.phase = "synchronizing-cloud-configuration";
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);
    return {
      operationId,
      status: "partially_updated",
      phase: pending.phase,
      previewFingerprint,
      prUrl: pending.prUrl,
      prNumber: pending.prNumber,
      branchName,
      message: pending.lastError,
    };
  }

  pending.phase = "running-configuration-canary";
  await writeRunnerUpgradePendingStateAtomic(pending, cwd);
  await writeProgress(cwd, pending, pending.phase);

  const dispatch = await provider.dispatchWorkflow(
    context.owner,
    context.repo,
    RUNNER_UPGRADE_CANARY_WORKFLOW_PATH,
    context.defaultBranch,
  );
  if (!dispatch.runId) {
    pending.lastError = "Workflow dispatch did not return a run id.";
    pending.syncInProgress = false;
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);
    return {
      operationId,
      status: "partially_updated",
      phase: pending.phase,
      previewFingerprint,
      prUrl: pending.prUrl,
      prNumber: pending.prNumber,
      branchName,
      message: pending.lastError,
    };
  }

  pending.canaryRunId = String(dispatch.runId);
  const canaryPoll = await pollCanaryRun(provider, {
    owner: context.owner,
    repo: context.repo,
    runId: dispatch.runId,
    pollIntervalMs: options.canaryPollIntervalMs ?? DEFAULT_CANARY_POLL_INTERVAL_MS,
    pollTimeoutMs: options.canaryPollTimeoutMs ?? DEFAULT_CANARY_POLL_TIMEOUT_MS,
  });

  if (!canaryPoll.ok) {
    pending.canaryRunUrl = `https://github.com/${context.owner}/${context.repo}/actions/runs/${dispatch.runId}`;
    pending.lastError = canaryPoll.message;
    pending.syncInProgress = false;
    await writeRunnerUpgradePendingStateAtomic(pending, cwd);
    await writeProgress(cwd, pending, pending.phase);
    return {
      operationId,
      status: "partially_updated",
      phase: pending.phase,
      previewFingerprint,
      prUrl: pending.prUrl,
      prNumber: pending.prNumber,
      branchName,
      canaryRunId: pending.canaryRunId,
      canaryRunUrl: pending.canaryRunUrl,
      message: pending.lastError,
    };
  }

  pending.canaryRunUrl = canaryPoll.run.htmlUrl;
  await recordRunnerUpgradeEvidence(
    {
      appliedSnapshotContentId: targetSnapshotContentId,
      appliedAt: new Date().toISOString(),
      targetSnapshotContentId,
      repositoryId: context.repositoryId,
      lastOperationId: operationId,
      syncInProgress: false,
      status: "up_to_date",
      canaryRunUrl: pending.canaryRunUrl,
    },
    cwd,
  );
  await clearRunnerUpgradePendingState(cwd);
  await writeRunnerUpgradeProgressAtomic(
    {
      operationId,
      phase: "running-configuration-canary",
      phaseStartedAt: new Date().toISOString(),
      startedAt,
      canaryRunUrl: pending.canaryRunUrl,
      prUrl: pending.prUrl,
      recoveryInstruction: "Runner upgrade completed successfully.",
    },
    cwd,
  );

  return {
    operationId,
    status: "up_to_date",
    phase: "running-configuration-canary",
    previewFingerprint,
    prUrl: pending.prUrl,
    prNumber: pending.prNumber,
    branchName,
    canaryRunId: pending.canaryRunId,
    canaryRunUrl: pending.canaryRunUrl,
    message: "Runner upgrade completed successfully.",
  };
}

export async function applyRunnerUpgrade(
  cwd: string | undefined,
  provider: RunnerUpgradeGitHubProvider,
  options: RunnerUpgradeApplyOptions = {},
): Promise<RunnerUpgradeApplyResult> {
  const workspaceDir = cwd ?? process.cwd();
  return withHarnessRunnerUpgradeMutex(workspaceDir, () =>
    applyRunnerUpgradeInternal(cwd, provider, options),
  );
}

export async function resumeRunnerUpgrade(
  cwd: string | undefined,
  provider: RunnerUpgradeGitHubProvider,
  options: RunnerUpgradeApplyOptions = {},
): Promise<RunnerUpgradeApplyResult> {
  const pending = await readRunnerUpgradePendingState(cwd);
  if (!pending) {
    return {
      operationId: randomUUID(),
      status: "update_available",
      phase: "verifying-managed-repository",
      previewFingerprint: "",
      message: "No pending runner upgrade operation to resume.",
    };
  }
  return applyRunnerUpgrade(cwd, provider, options);
}

export async function readLocalManagedRepoMarker(
  cwd?: string,
): Promise<string | null> {
  const markerPath =
    process.env.CANARY_MARKER_PATH ??
    path.join(cwd ?? process.cwd(), HARNESS_MANAGED_REPO_MARKER_FILE);
  try {
    return await readFile(markerPath, "utf8");
  } catch {
    return null;
  }
}
