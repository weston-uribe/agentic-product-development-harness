import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubRemoteSetupProvider } from "../../src/setup/github-remote-provider.js";
import { TARGET_WORKFLOW_PATH } from "../../src/setup/remote-actions.js";
import {
  advanceTargetWorkflowFinalizationStep,
  resetTargetWorkflowFinalizationSessionsForTests,
} from "../../src/setup/target-workflow-finalization.js";
import {
  buildTargetWorkflowBranchName,
  previewTargetWorkflowSetup,
} from "../../src/setup/target-workflow-setup.js";
import { WORKFLOW_INSTALL_CHECK_POLL_TIMEOUT_MS } from "../../src/setup/target-workflow-finalization-types.js";

const ACTUAL_HEAD_SHA = "actual-head-sha";
const SYNTHETIC_MERGE_SHA = "synthetic-merge-sha";
const REPO_CONFIG_ID = "target-app";
const TARGET_REPO = "https://github.com/owner/example-target-app";
const TARGET_REPO_SLUG = "owner/example-target-app";
const PRODUCTION_BRANCH = "main";
const BRANCH_NAME = buildTargetWorkflowBranchName(REPO_CONFIG_ID);
const PR_URL = `https://github.com/${TARGET_REPO_SLUG}/pull/27`;
const PR_NUMBER = 27;

function intendedWorkflowContent(): string {
  return previewTargetWorkflowSetup({
    repoConfigId: REPO_CONFIG_ID,
    targetRepo: TARGET_REPO,
    productionBranch: PRODUCTION_BRANCH,
    harnessDispatchRepo: {
      repo: "owner/harness-repo",
      source: "manual",
      resolved: true,
    },
  }).workflowContent;
}

function openPull(overrides: Record<string, unknown> = {}) {
  return {
    title: "Install harness production sync workflow",
    html_url: PR_URL,
    head: { ref: BRANCH_NAME, sha: ACTUAL_HEAD_SHA },
    base: { ref: PRODUCTION_BRANCH },
    state: "open",
    merged: false,
    draft: false,
    mergeable: true,
    mergeable_state: "clean",
    merged_at: null,
    merge_commit_sha: SYNTHETIC_MERGE_SHA,
    ...overrides,
  };
}

function checksOnActualHeadOnly(ref: string) {
  return {
    check_runs:
      ref === ACTUAL_HEAD_SHA
        ? [
            {
              name: "Vercel",
              status: "completed",
              conclusion: "success",
              details_url: "https://vercel.com/deploy",
            },
          ]
        : [],
  };
}

function combinedStatusOnActualHeadOnly(ref: string) {
  return ref === ACTUAL_HEAD_SHA
    ? {
        state: "success",
        statuses: [
          {
            context: "Vercel",
            state: "success",
            target_url: "https://vercel.com/deploy",
          },
        ],
      }
    : { state: "pending", statuses: [] };
}

function createMockGitHubClient(options: {
  pull?: Record<string, unknown> | (() => Record<string, unknown>);
  checkRunsForRef?: (ref: string) => { check_runs: Record<string, unknown>[] };
  combinedStatus?: (ref: string) => {
    state: string;
    statuses: Array<{
      context: string;
      state: string;
      target_url: string | null;
    }>;
  };
}) {
  const workflow = intendedWorkflowContent();
  const pullFn =
    typeof options.pull === "function" ? options.pull : () => options.pull ?? openPull();

  return {
    getPullRequest: vi.fn(async () => pullFn()),
    getPullRequestFiles: vi.fn(async () => [
      { filename: TARGET_WORKFLOW_PATH, status: "added" },
    ]),
    getCheckRunsForRef: vi.fn(async (_owner, _repo, ref: string) =>
      options.checkRunsForRef
        ? options.checkRunsForRef(ref)
        : checksOnActualHeadOnly(ref),
    ),
    getCombinedStatusForRef: vi.fn(async (_owner, _repo, ref: string) =>
      options.combinedStatus
        ? options.combinedStatus(ref)
        : combinedStatusOnActualHeadOnly(ref),
    ),
    getIssueComments: vi.fn(async () => []),
    getRepositoryContent: vi.fn(async () => ({
      content: Buffer.from(workflow).toString("base64"),
      encoding: "base64",
    })),
    decodeRepositoryContent: vi.fn((content: { content: string }) =>
      Buffer.from(content.content, "base64").toString("utf8"),
    ),
    mergePullRequest: vi.fn(async () => ({ sha: "merge-result-sha", merged: true })),
    updatePullRequestBranch: vi.fn(async () => ({ message: "Updating" })),
    markPullRequestReadyForReview: vi.fn(async (owner, repo, number) => {
      const pull = await pullFn();
      return { ...pull, draft: false };
    }),
    listPullRequests: vi.fn(async () => []),
  };
}

function createStubProvider(
  workflowStatus: "missing" | "present" = "missing",
): GitHubRemoteSetupProvider {
  let status = workflowStatus;
  return {
    checkTargetWorkflowStatus: vi.fn(async () => ({
      workflowStatus: status,
    })),
    setProductionPresent: () => {
      status = "present";
    },
  } as unknown as GitHubRemoteSetupProvider & { setProductionPresent: () => void };
}

async function writeHarnessConfig(tempRoot: string): Promise<void> {
  await mkdir(path.join(tempRoot, ".harness"), { recursive: true });
  await writeFile(
    path.join(tempRoot, ".harness", "config.local.json"),
    JSON.stringify(
      {
        version: 1,
        repos: [
          {
            id: REPO_CONFIG_ID,
            targetRepo: TARGET_REPO,
            productionBranch: PRODUCTION_BRANCH,
          },
        ],
        allowedTargetRepos: [TARGET_REPO],
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("advanceTargetWorkflowFinalizationStep GitHub head SHA handling", () => {
  let tempRoot = "";
  const originalConfigPath = process.env.HARNESS_CONFIG_PATH;

  beforeEach(async () => {
    resetTargetWorkflowFinalizationSessionsForTests();
    process.env.HARNESS_CONFIG_PATH = ".harness/config.local.json";
    tempRoot = await mkdtemp(path.join(tmpdir(), "finalization-step-github-"));
    await writeHarnessConfig(tempRoot);
    vi.useRealTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (originalConfigPath === undefined) {
      delete process.env.HARNESS_CONFIG_PATH;
    } else {
      process.env.HARNESS_CONFIG_PATH = originalConfigPath;
    }
    await rm(tempRoot, { recursive: true, force: true });
  });

  const baseInput = {
    repoConfigId: REPO_CONFIG_ID,
    targetRepo: TARGET_REPO,
    productionBranch: PRODUCTION_BRANCH,
    manualHarnessDispatchRepo: "owner/harness-repo",
    prUrl: PR_URL,
    branchName: BRANCH_NAME,
  };

  it("advances past waiting-for-checks and merges with actual head SHA", async () => {
    const client = createMockGitHubClient({});
    const provider = createStubProvider("missing");
    (provider.checkTargetWorkflowStatus as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ workflowStatus: "missing" })
      .mockResolvedValue({ workflowStatus: "present" });

    const first = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });

    expect(["merging", "verifying", "complete"]).toContain(first.lifecycle);
    expect(first.validatedHeadSha).toBe(ACTUAL_HEAD_SHA);
    expect(client.mergePullRequest).toHaveBeenCalledWith(
      "owner",
      "example-target-app",
      PR_NUMBER,
      expect.objectContaining({ expectedHeadSha: ACTUAL_HEAD_SHA }),
    );
    expect(client.getCheckRunsForRef).toHaveBeenCalledWith(
      "owner",
      "example-target-app",
      ACTUAL_HEAD_SHA,
    );
    expect(client.getCheckRunsForRef).not.toHaveBeenCalledWith(
      "owner",
      "example-target-app",
      SYNTHETIC_MERGE_SHA,
    );

    if (first.lifecycle === "complete") {
      return;
    }

    (provider.checkTargetWorkflowStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      workflowStatus: "present",
    });

    const complete = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });

    expect(complete.lifecycle).toBe("complete");
  });

  it("recognizes legacy Vercel combined statuses on actual head only", async () => {
    const client = createMockGitHubClient({
      checkRunsForRef: () => ({ check_runs: [] }),
      combinedStatus: combinedStatusOnActualHeadOnly,
    });
    const provider = createStubProvider("missing");
    (provider.checkTargetWorkflowStatus as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ workflowStatus: "missing" })
      .mockResolvedValue({ workflowStatus: "present" });

    const result = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });

    expect(result.lifecycle).not.toBe("blocked");
    expect(result.blockedCategory).not.toBe("checks-pending");
    expect(client.getCombinedStatusForRef).toHaveBeenCalledWith(
      "owner",
      "example-target-app",
      ACTUAL_HEAD_SHA,
    );
    expect(client.getCombinedStatusForRef).not.toHaveBeenCalledWith(
      "owner",
      "example-target-app",
      SYNTHETIC_MERGE_SHA,
    );
  });

  it("revalidates when head changes between polls and merges with the new SHA", async () => {
    const HEAD_A = "head-sha-a";
    const HEAD_B = "head-sha-b";
    let call = 0;
    const client = createMockGitHubClient({
      pull: () => {
        call += 1;
        return openPull({
          head: { ref: BRANCH_NAME, sha: call === 1 ? HEAD_A : HEAD_B },
        });
      },
      checkRunsForRef: (ref) => ({
        check_runs:
          ref === HEAD_A || ref === HEAD_B
            ? [
                {
                  name: "Vercel",
                  status: "completed",
                  conclusion: "success",
                  details_url: null,
                },
              ]
            : [],
      }),
    });
    const provider = createStubProvider("missing");
    (provider.checkTargetWorkflowStatus as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ workflowStatus: "missing" })
      .mockResolvedValueOnce({ workflowStatus: "missing" })
      .mockResolvedValueOnce({ workflowStatus: "missing" })
      .mockResolvedValue({ workflowStatus: "present" });

    const first = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });
    expect(first.validatedHeadSha).toBe(HEAD_A);
    expect(first.lifecycle).toBe("verifying");

    const second = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });
    expect(second.validatedHeadSha).toBe(HEAD_B);
    expect(["verifying", "complete"]).toContain(second.lifecycle);
    expect(client.mergePullRequest).toHaveBeenLastCalledWith(
      "owner",
      "example-target-app",
      PR_NUMBER,
      expect.objectContaining({ expectedHeadSha: HEAD_B }),
    );

    if (second.lifecycle === "complete") {
      return;
    }

    const complete = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });
    expect(complete.lifecycle).toBe("complete");
  });

  it("completes already-merged PR via production verification without merging again", async () => {
    const client = createMockGitHubClient({
      pull: openPull({
        state: "closed",
        merged: true,
        merged_at: "2026-07-13T00:00:00Z",
        merge_commit_sha: "merged-on-main-sha",
      }),
    });
    const provider = createStubProvider("missing");
    (provider.checkTargetWorkflowStatus as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ workflowStatus: "missing" })
      .mockResolvedValue({ workflowStatus: "present" });

    const result = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });

    expect(result.lifecycle).toBe("complete");
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(client.getCheckRunsForRef).toHaveBeenCalledWith(
      "owner",
      "example-target-app",
      ACTUAL_HEAD_SHA,
    );
  });

  it("times out when checks exist only on synthetic merge_commit_sha", async () => {
    vi.useFakeTimers();
    const client = createMockGitHubClient({
      checkRunsForRef: (ref) => ({
        check_runs:
          ref === SYNTHETIC_MERGE_SHA
            ? [
                {
                  name: "Vercel",
                  status: "completed",
                  conclusion: "success",
                  details_url: null,
                },
              ]
            : [],
      }),
      combinedStatus: () => ({ state: "pending", statuses: [] }),
    });
    const provider = createStubProvider("missing");

    const waiting = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });
    expect(waiting.lifecycle).toBe("waiting-for-checks");

    vi.advanceTimersByTime(WORKFLOW_INSTALL_CHECK_POLL_TIMEOUT_MS + 1);

    const blocked = await advanceTargetWorkflowFinalizationStep({
      cwd: tempRoot,
      input: baseInput,
      provider,
      client: client as never,
    });

    expect(blocked.lifecycle).toBe("blocked");
    expect(blocked.blockedCategory).toBe("checks-pending");
    expect(blocked.message).toContain(
      "Timed out waiting for GitHub checks on the workflow install PR.",
    );
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(client.getCheckRunsForRef).toHaveBeenCalledWith(
      "owner",
      "example-target-app",
      ACTUAL_HEAD_SHA,
    );
  });
});
