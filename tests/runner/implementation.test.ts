import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImplementationError } from "../../src/runner/errors.js";

const mocks = vi.hoisted(() => ({
  transitionIssueStatus: vi.fn(),
  postErrorComment: vi.fn(),
  listIssueComments: vi.fn(),
  createLinearClient: vi.fn(),
  createImplementationAgent: vi.fn(),
  disposeAgent: vi.fn(),
  sendAndObserve: vi.fn(),
  fetchLinearIssue: vi.fn(),
}));

vi.mock("../../src/linear/writer.js", () => ({
  transitionIssueStatus: mocks.transitionIssueStatus,
  postErrorComment: mocks.postErrorComment,
  listIssueComments: mocks.listIssueComments,
  createLinearClient: mocks.createLinearClient,
}));

vi.mock("../../src/agents/index.js", () => ({
  createImplementationAgent: mocks.createImplementationAgent,
  disposeAgent: mocks.disposeAgent,
  sendAndObserve: mocks.sendAndObserve,
  resolveModelId: vi.fn().mockReturnValue("composer-2.5"),
}));

vi.mock("../../src/linear/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/linear/client.js")>();
  return {
    ...actual,
    fetchLinearIssue: mocks.fetchLinearIssue,
  };
});

import { executeImplementationPhase } from "../../src/runner/phases/implementation.js";
import type { HarnessConfig } from "../../src/config/types.js";

const issueDescription = `## Target repo

weston-uribe/weston-uribe-portfolio

## Task

Add a temporary Hello World page to the portfolio app and add a top-nav link to that page.

## Acceptance criteria

- [ ] A temporary Hello World page exists in the portfolio app
- [ ] A visible top-nav link opens the Hello World page
- [ ] The change is narrow and reversible
- [ ] Validation commands are run
- [ ] A PR is opened against the portfolio repo
- [ ] No merge is performed
- [ ] No preview capture or PM Review transition is required in this milestone

## Out of scope

- [ ] Merging the PR
- [ ] Capturing Vercel preview

## Validation expectations

Run npm run lint and npm run build.`;

describe("executeImplementationPhase", () => {
  let tempRoot = "";
  let configPath = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-implementation-"));
    const config: HarnessConfig = {
      version: 1,
      orchestratorMarker: "harness-orchestrator-v1",
      logDirectory: tempRoot,
      defaultModel: { id: "composer-2.5" },
      linear: {
        teamKey: "WES",
        eligibleStatuses: {
          planning: ["Ready for Planning"],
          implementation: ["Ready for Build"],
        },
        transitionalStatuses: {
          planningInProgress: "Planning",
          buildingInProgress: "Building",
          prOpen: "PR Open",
          pmReview: "PM Review",
          blocked: "Blocked",
          readyForBuild: "Ready for Build",
        },
      },
      implementation: { timeoutSeconds: 60, branchPrefix: "cursor" },
      repos: [
        {
          id: "portfolio",
          linearProjects: ["Portfolio"],
          targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
          baseBranch: "main",
          previewProvider: "vercel",
          validation: {
            commands: ["npm run lint", "npm run build"],
          },
        },
      ],
      allowedTargetRepos: [
        "https://github.com/weston-uribe/weston-uribe-portfolio",
      ],
    };
    configPath = path.join(tempRoot, "harness.config.json");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(configPath, JSON.stringify(config), "utf8"),
    );

    process.env.LINEAR_API_KEY = "test-linear-key";
    process.env.CURSOR_API_KEY = "test-cursor-key";

    mocks.listIssueComments.mockResolvedValue([]);
    mocks.transitionIssueStatus.mockResolvedValue(undefined);
    mocks.postErrorComment.mockResolvedValue("error-comment-1");
    mocks.createLinearClient.mockReturnValue({});
    mocks.createImplementationAgent.mockResolvedValue({
      agentId: "agent-impl",
      [Symbol.asyncDispose]: async () => undefined,
    });
    mocks.fetchLinearIssue.mockResolvedValue({
      id: "issue-impl",
      identifier: "WES-12",
      title: "M3 implementation integration test",
      description: issueDescription,
      status: "Ready for Build",
      projectName: "Portfolio",
      teamName: "WES",
      teamId: "team-1",
      url: "https://linear.app/example/issue/WES-12/test",
    });
  });

  afterEach(async () => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("runs happy path with Building and PR Open transitions", async () => {
    mocks.sendAndObserve.mockResolvedValue({
      agentId: "agent-impl",
      runId: "run-impl",
      assistantText: "## Implementation summary\n\nDone",
      gitResult: {
        repoUrl: "https://github.com/weston-uribe/weston-uribe-portfolio",
        branch: "cursor/wes-12-m3-implementation-integration-test",
        prUrl: "https://github.com/weston-uribe/weston-uribe-portfolio/pull/12",
      },
      result: { id: "run-impl", status: "finished" },
    });

    const result = await executeImplementationPhase({
      issueKey: "WES-12",
      configPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.manifest.finalOutcome).toBe("success");
    expect(result.manifest.linearStatusBefore).toBe("Ready for Build");
    expect(result.manifest.linearStatusAfter).toBe("PR Open");
    expect(result.manifest.branch).toBe(
      "cursor/wes-12-m3-implementation-integration-test",
    );
    expect(result.manifest.prUrl).toContain("/pull/12");
    expect(mocks.transitionIssueStatus).toHaveBeenCalledTimes(2);
    expect(mocks.postErrorComment).not.toHaveBeenCalled();
  });

  it("moves to Blocked after failure once Building was entered", async () => {
    mocks.sendAndObserve.mockRejectedValue(
      new ImplementationError("cursor_run_failed", "agent failed"),
    );

    const result = await executeImplementationPhase({
      issueKey: "WES-12",
      configPath,
    });

    expect(result.exitCode).toBe(3);
    expect(result.manifest.finalOutcome).toBe("failed");
    expect(result.manifest.errorClassification).toBe("cursor_run_failed");
    expect(result.manifest.linearStatusAfter).toBe("Blocked");
    expect(mocks.postErrorComment).toHaveBeenCalledTimes(1);
    expect(mocks.transitionIssueStatus).toHaveBeenCalledTimes(2);
  });
});
