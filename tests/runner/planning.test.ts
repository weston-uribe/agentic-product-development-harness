import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transitionIssueStatus: vi.fn(),
  postPlanningComment: vi.fn(),
  listIssueComments: vi.fn(),
  createLinearClient: vi.fn(),
  createPlanningAgent: vi.fn(),
  disposeAgent: vi.fn(),
  sendAndObserve: vi.fn(),
  fetchLinearIssue: vi.fn(),
}));

vi.mock("../../src/linear/writer.js", () => ({
  transitionIssueStatus: mocks.transitionIssueStatus,
  postPlanningComment: mocks.postPlanningComment,
  listIssueComments: mocks.listIssueComments,
  postErrorComment: vi.fn(),
  createLinearClient: mocks.createLinearClient,
}));

vi.mock("../../src/agents/index.js", () => ({
  createPlanningAgent: mocks.createPlanningAgent,
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

import { executePlanningPhase } from "../../src/runner/phases/planning.js";
import type { HarnessConfig } from "../../src/config/types.js";

describe("executePlanningPhase", () => {
  let tempRoot = "";
  let configPath = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-planning-"));
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
      planning: { timeoutSeconds: 60 },
      repos: [
        {
          id: "target-app",
          linearProjects: ["Example Target App"],
          targetRepo: "https://github.com/owner/example-target-app",
          baseBranch: "main",
          previewProvider: "vercel",
        },
      ],
      allowedTargetRepos: [
        "https://github.com/owner/example-target-app",
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
    mocks.postPlanningComment.mockResolvedValue("comment-1");
    mocks.createLinearClient.mockReturnValue({});

    const mockHandle = { __brand: Symbol("AgentHandle") };
    mocks.createPlanningAgent.mockResolvedValue(mockHandle);
    mocks.disposeAgent.mockResolvedValue(undefined);
    mocks.sendAndObserve.mockResolvedValue({
      agentId: "agent-abc",
      runId: "run-xyz",
      assistantText: "## Implementation plan\n\nStep 1",
      result: { id: "run-xyz", status: "completed" },
    });

    mocks.fetchLinearIssue.mockImplementation(async (issueKey: string) => {
      if (issueKey === "WES-PLAN") {
        return {
          id: "issue-plan",
          identifier: "WES-PLAN",
          title: "Plan hello world",
          description: `## Target repo\n\nowner/example-target-app\n\n## Task\n\nAdd hello page\n\n## Acceptance criteria\n\n- [ ] Route works\n\n## Out of scope\n\n- Harness`,
          status: "Ready for Planning",
          projectName: "Example Target App",
          teamName: "WES",
          teamId: "team-1",
          url: null,
        };
      }
      return {
        id: "issue-plan",
        identifier: "WES-PLAN",
        title: "Plan hello world",
        description: "",
        status: "Ready for Build",
        projectName: "Example Target App",
        teamName: "WES",
        teamId: "team-1",
        url: null,
      };
    });
  });

  afterEach(async () => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("runs happy path with Planning and Ready for Build transitions", async () => {
    const result = await executePlanningPhase({
      issueKey: "WES-PLAN",
      configPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.manifest.finalOutcome).toBe("success");
    expect(result.manifest.cursorAgentId).toBe("agent-abc");
    expect(result.manifest.cursorRunId).toBe("run-xyz");
    expect(result.manifest.linearStatusBefore).toBe("Ready for Planning");
    expect(result.manifest.linearStatusAfter).toBe("Ready for Build");
    expect(result.manifest.dryRun).toBe(false);
    expect(result.manifest.milestone).toBe("v0.2-prep");

    expect(mocks.transitionIssueStatus).toHaveBeenCalledTimes(2);
    expect(mocks.postPlanningComment).toHaveBeenCalledTimes(1);
    expect(mocks.sendAndObserve).toHaveBeenCalledTimes(1);
  });
});
