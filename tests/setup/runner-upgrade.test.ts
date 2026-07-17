import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeGitBlobSha1 } from "../../src/p-dev/git-object-plumbing.js";
import {
  buildWorkspaceSnapshotManifest,
  fingerprintWorkspaceSnapshotManifest,
} from "../../src/p-dev/workspace-snapshot-manifest.js";
import type { WorkspaceSnapshotManifest } from "../../src/p-dev/workspace-snapshot-types.js";
import {
  buildHarnessSnapshotManagedRepoMarker,
  HARNESS_MANAGED_REPO_MARKER_FILE,
} from "../../src/setup/harness-managed-repo-marker.js";
import { deterministicMockRepositoryId } from "../../src/setup/github-remote-provider.js";
import { readControlPlaneSetupState } from "../../src/setup/control-plane-setup-state.js";
import {
  buildRunnerUpgradeBranchName,
  buildRunnerUpgradePrMarker,
} from "../../src/setup/runner-upgrade-types.js";
import {
  readRunnerUpgradePendingState,
} from "../../src/setup/runner-upgrade-pending-state.js";
import { createMockRunnerUpgradeProvider } from "../../src/setup/runner-upgrade-provider.js";
import {
  applyRunnerUpgrade,
  loadRunnerUpgradeStatus,
  previewRunnerUpgrade,
  resumeRunnerUpgrade,
} from "../../src/setup/runner-upgrade.js";
import { createTestWorkspaceSnapshotRoot } from "./test-workspace-snapshot-fixture.js";

const REPO_SLUG = "owner/harness-repo";
const README_V1 = Buffer.from("# runner v1\n", "utf8");
const README_V2 = Buffer.from("# runner v2\n", "utf8");

const snapshotFixture = vi.hoisted(() => ({
  snapshotRoot: "",
  packageRoot: "",
  manifest: null as WorkspaceSnapshotManifest | null,
  fingerprint: "",
}));

vi.mock("../../src/setup/harness-workspace-snapshot-loader.js", () => ({
  loadEmbeddedWorkspaceSnapshot: vi.fn(async () => {
    if (!snapshotFixture.manifest) {
      return {
        ok: false as const,
        state: "snapshot-unavailable" as const,
        message: "Test snapshot fixture is not initialized.",
      };
    }
    return {
      ok: true as const,
      packageRoot: snapshotFixture.packageRoot,
      snapshotRoot: snapshotFixture.snapshotRoot,
      packageVersion: snapshotFixture.manifest.packageVersion,
      manifest: snapshotFixture.manifest,
      fingerprint: snapshotFixture.fingerprint,
    };
  }),
}));

function buildManifest(input: {
  readme: Buffer;
  packageVersion?: string;
  sourceCommit?: string;
}): WorkspaceSnapshotManifest {
  const gitBlobSha1 = computeGitBlobSha1(input.readme);
  return buildWorkspaceSnapshotManifest({
    packageVersion: input.packageVersion ?? "0.3.1",
    sourceCommit: input.sourceCommit ?? "cccccccccccccccccccccccccccccccccccccccc",
    entries: [
      {
        path: "README.md",
        type: "file",
        mode: "100644",
        size: input.readme.byteLength,
        content: input.readme,
        gitBlobSha1,
      },
    ],
  });
}

function markerJson(manifest: WorkspaceSnapshotManifest): string {
  return `${JSON.stringify(
    buildHarnessSnapshotManagedRepoMarker({
      repository: REPO_SLUG,
      repositoryId: deterministicMockRepositoryId(REPO_SLUG),
      manifest,
      snapshotCommitSha: "remote-marker-commit",
      defaultBranch: "main",
    }),
    null,
    2,
  )}\n`;
}

async function writeWorkspaceEnv(root: string): Promise<void> {
  await mkdir(path.join(root, ".harness"), { recursive: true });
  await writeFile(
    path.join(root, ".env.local"),
    [
      "GITHUB_TOKEN=ghp_test_token",
      "GITHUB_DISPATCH_REPOSITORY=owner/harness-repo",
      "LINEAR_API_KEY=linear-test-key",
      "CURSOR_API_KEY=cursor-test-key",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(root, ".harness", "config.local.json"),
    `${JSON.stringify(
      {
        version: 1,
        orchestratorMarker: "harness-orchestrator-v1",
        logDirectory: "runs",
        repos: [
          {
            id: "target-app",
            targetRepo: "https://github.com/owner/example-target-app",
            baseBranch: "main",
            productionBranch: "main",
          },
        ],
        allowedTargetRepos: ["https://github.com/owner/example-target-app"],
        linear: { teamKey: "WES" },
        roleModels: {
          planner: { id: "composer-2.5" },
          builder: { id: "composer-2.5" },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function seedPackageSnapshot(manifest: WorkspaceSnapshotManifest): Promise<void> {
  const fixture = await createTestWorkspaceSnapshotRoot(manifest.packageVersion);
  snapshotFixture.packageRoot = fixture.packageRoot;
  snapshotFixture.snapshotRoot = fixture.snapshotRoot;
  snapshotFixture.manifest = manifest;
  snapshotFixture.fingerprint = fingerprintWorkspaceSnapshotManifest(manifest);
  await writeFile(
    path.join(snapshotFixture.snapshotRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(snapshotFixture.snapshotRoot, "files", "README.md"), README_V2);
}

async function createProvider(input: {
  remoteManifest: WorkspaceSnapshotManifest;
  remoteFiles?: Record<string, string>;
  pullRequests?: Array<{
    number: number;
    htmlUrl: string;
    headRef: string;
    baseRef: string;
    body: string;
    state: "open" | "closed";
    headSha: string;
  }>;
  syncShouldFail?: boolean;
  canaryConclusion?: "success" | "failure";
}) {
  const remoteMarker =
    input.remoteFiles?.[HARNESS_MANAGED_REPO_MARKER_FILE] ?? markerJson(input.remoteManifest);
  const remoteFiles = {
    "README.md": README_V1.toString("utf8"),
    ...(input.remoteFiles ?? {}),
    [HARNESS_MANAGED_REPO_MARKER_FILE]: remoteMarker,
  };
  return createMockRunnerUpgradeProvider({
    syncShouldFail: input.syncShouldFail,
    canaryConclusion: input.canaryConclusion,
    repositories: {
      [REPO_SLUG]: {
        repositoryId: deterministicMockRepositoryId(REPO_SLUG),
        owner: "owner",
        repo: "harness-repo",
        defaultBranch: "main",
        managedMarkerContent: remoteMarker,
        remoteFiles,
        pullRequests: input.pullRequests,
      },
    },
  });
}

describe("runner upgrade orchestration", () => {
  let workspaceDir = "";
  const v1Manifest = buildManifest({ readme: README_V1 });
  const v2Manifest = buildManifest({ readme: README_V2 });

  beforeEach(async () => {
    workspaceDir = await mkdtemp(path.join(tmpdir(), "runner-upgrade-"));
    await writeWorkspaceEnv(workspaceDir);
    await seedPackageSnapshot(v2Manifest);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("reports update available when remote snapshot is older than package", async () => {
    const provider = await createProvider({ remoteManifest: v1Manifest });
    const status = await loadRunnerUpgradeStatus(workspaceDir, provider);
    expect(status.status).toBe("update_available");
    expect(status.currentSnapshot?.snapshotContentId).toBe(v1Manifest.snapshotContentId);
    expect(status.availableSnapshot?.snapshotContentId).toBe(v2Manifest.snapshotContentId);
  });

  it("reports up to date when remote snapshot matches package", async () => {
    const provider = await createProvider({ remoteManifest: v2Manifest });
    const status = await loadRunnerUpgradeStatus(workspaceDir, provider);
    expect(status.status).toBe("up_to_date");
  });

  it("blocks non-managed repositories without snapshot marker provenance", async () => {
    const provider = await createProvider({
      remoteManifest: v1Manifest,
      remoteFiles: {
        [HARNESS_MANAGED_REPO_MARKER_FILE]: `${JSON.stringify({ invalid: true })}\n`,
      },
    });
    const status = await loadRunnerUpgradeStatus(workspaceDir, provider);
    expect(status.status).toBe("blocked_non_managed");
  });

  it("blocks preview when operator edits conflict with packaged upgrade", async () => {
    const provider = await createProvider({
      remoteManifest: v1Manifest,
      remoteFiles: {
        "README.md": "# operator edited\n",
      },
    });
    const preview = await previewRunnerUpgrade(workspaceDir, provider);
    expect(preview.blocked).toBe(true);
    expect(preview.blockedStatus).toBe("blocked_operator_conflicts");
    expect(preview.conflictPaths).toContain("README.md");
  });

  it("reuses an open snapshot-keyed PR after local pending state was cleared", async () => {
    const branchName = buildRunnerUpgradeBranchName(v2Manifest.snapshotContentId);
    const provider = await createProvider({
      remoteManifest: v1Manifest,
      pullRequests: [
        {
          number: 7,
          htmlUrl: "https://github.com/owner/harness-repo/pull/7",
          headRef: branchName,
          baseRef: "main",
          body: buildRunnerUpgradePrMarker(
            deterministicMockRepositoryId(REPO_SLUG),
            v2Manifest.snapshotContentId,
          ),
          state: "open",
          headSha: "existing-head-sha",
        },
      ],
    });

    const preview = await previewRunnerUpgrade(workspaceDir, provider);
    const result = await applyRunnerUpgrade(workspaceDir, provider, {
      previewFingerprint: preview.previewFingerprint,
      canaryPollIntervalMs: 1,
      canaryPollTimeoutMs: 50,
    });

    expect(result.status).toBe("up_to_date");
    expect(
      provider.calls.filter((call) => call.method === "createPullRequest"),
    ).toHaveLength(0);
    expect(
      provider.calls.some((call) => call.method === "mergePullRequest"),
    ).toBe(true);
  });

  it("returns partially_updated when cloud sync fails and resumes from sync phase", async () => {
    const provider = await createProvider({
      remoteManifest: v1Manifest,
      syncShouldFail: true,
    });
    const preview = await previewRunnerUpgrade(workspaceDir, provider);
    const failed = await applyRunnerUpgrade(workspaceDir, provider, {
      previewFingerprint: preview.previewFingerprint,
      canaryPollIntervalMs: 1,
      canaryPollTimeoutMs: 50,
    });
    expect(failed.status).toBe("partially_updated");
    expect(failed.phase).toBe("synchronizing-cloud-configuration");

    const pending = await readRunnerUpgradePendingState(workspaceDir);
    expect(pending?.codeUpdateComplete).toBe(true);

    const resumeProvider = await createProvider({ remoteManifest: v2Manifest });
    const resumed = await resumeRunnerUpgrade(workspaceDir, resumeProvider, {
      canaryPollIntervalMs: 1,
      canaryPollTimeoutMs: 50,
    });
    expect(resumed.status).toBe("up_to_date");
    expect(
      resumeProvider.calls.some((call) => call.method === "createPullRequest"),
    ).toBe(false);
  });

  it("completes upgrade through canary success and records control-plane evidence", async () => {
    const provider = await createProvider({
      remoteManifest: v1Manifest,
      canaryConclusion: "success",
    });
    const preview = await previewRunnerUpgrade(workspaceDir, provider);
    const result = await applyRunnerUpgrade(workspaceDir, provider, {
      previewFingerprint: preview.previewFingerprint,
      canaryPollIntervalMs: 1,
      canaryPollTimeoutMs: 50,
    });

    expect(result.status).toBe("up_to_date");
    expect(result.canaryRunUrl).toContain("/actions/runs/");

    const setupState = await readControlPlaneSetupState(workspaceDir);
    expect(setupState?.runnerUpgrade?.status).toBe("up_to_date");
    expect(setupState?.runnerUpgrade?.appliedSnapshotContentId).toBe(
      v2Manifest.snapshotContentId,
    );

    const pendingPath = path.join(
      workspaceDir,
      ".harness",
      "p-dev-runner-upgrade.pending.json",
    );
    await expect(readFile(pendingPath, "utf8")).rejects.toThrow();
  });

  it("writes cloud secrets before fingerprint variable during sync", async () => {
    const provider = await createProvider({ remoteManifest: v1Manifest });
    const preview = await previewRunnerUpgrade(workspaceDir, provider);
    await applyRunnerUpgrade(workspaceDir, provider, {
      previewFingerprint: preview.previewFingerprint,
      canaryPollIntervalMs: 1,
      canaryPollTimeoutMs: 50,
    });
    expect(provider.remoteWriteOrder).toEqual(["secret", "variable"]);
  });

  it("keeps pending operation id across resume", async () => {
    const provider = await createProvider({
      remoteManifest: v1Manifest,
      syncShouldFail: true,
    });
    const preview = await previewRunnerUpgrade(workspaceDir, provider);
    await applyRunnerUpgrade(workspaceDir, provider, {
      previewFingerprint: preview.previewFingerprint,
      canaryPollIntervalMs: 1,
      canaryPollTimeoutMs: 50,
    });
    const pendingBefore = await readRunnerUpgradePendingState(workspaceDir);
    expect(pendingBefore?.operationId).toBeTruthy();
    expect(pendingBefore?.codeUpdateComplete).toBe(true);

    const resumeProvider = await createProvider({ remoteManifest: v2Manifest });
    await resumeRunnerUpgrade(workspaceDir, resumeProvider, {
      canaryPollIntervalMs: 1,
      canaryPollTimeoutMs: 50,
    });
    const pendingAfter = await readRunnerUpgradePendingState(workspaceDir);
    expect(pendingAfter).toBeNull();
  });
});
