import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMergeConcurrencyGroup,
  resolveRoute,
} from "../../src/runner/resolve-route.js";
import type { HarnessConfig } from "../../src/config/types.js";

const mocks = vi.hoisted(() => ({
  fetchLinearIssue: vi.fn(),
}));

vi.mock("../../src/linear/client.js", () => ({
  fetchLinearIssue: mocks.fetchLinearIssue,
}));

const portfolioConfig: HarnessConfig = {
  version: 1,
  orchestratorMarker: "harness-orchestrator-v1",
  logDirectory: "runs",
  linear: {
    teamKey: "WES",
    eligibleStatuses: {
      planning: ["Ready for Planning"],
      implementation: ["Ready for Build"],
      handoff: ["PR Open"],
      revision: ["Needs Revision"],
      merge: ["Ready to Merge"],
    },
  },
  repos: [
    {
      id: "portfolio",
      linearProjects: ["Portfolio"],
      targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
      baseBranch: "dev",
      productionBranch: "main",
      previewProvider: "vercel",
    },
  ],
  allowedTargetRepos: ["https://github.com/weston-uribe/weston-uribe-portfolio"],
};

describe("buildMergeConcurrencyGroup", () => {
  it("builds repo and base branch slug", () => {
    expect(buildMergeConcurrencyGroup("portfolio", "dev")).toBe("portfolio-dev");
  });

  it("sanitizes branch characters", () => {
    expect(buildMergeConcurrencyGroup("portfolio", "feature/foo")).toBe(
      "portfolio-feature-foo",
    );
  });
});

describe("resolveRoute", () => {
  let tempRoot = "";
  let configPath = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-resolve-route-"));
    configPath = path.join(tempRoot, "harness.config.json");
    await writeFile(configPath, `${JSON.stringify(portfolioConfig, null, 2)}\n`, "utf8");
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("resolves merge phase and portfolio dev merge group", async () => {
    mocks.fetchLinearIssue.mockResolvedValue({
      id: "issue-1",
      identifier: "WES-21",
      title: "Merge test",
      description: `## Target repo\n\nweston-uribe/weston-uribe-portfolio\n\n## Task\n\nTest\n\n## Acceptance criteria\n\n- [ ] Done\n\n## Out of scope\n\n- [ ] N/A`,
      status: "Ready to Merge",
      projectName: "Portfolio",
      teamName: "WES",
      teamId: "team-1",
      url: "https://linear.app/example/issue/WES-21",
    });

    const result = await resolveRoute({
      issueKey: "WES-21",
      configPath,
      linearApiKey: "test-key",
    });

    expect(result.phase).toBe("merge");
    expect(result.repoConfigId).toBe("portfolio");
    expect(result.baseBranch).toBe("dev");
    expect(result.mergeConcurrencyGroup).toBe("portfolio-dev");
    expect(result.shouldRun).toBe(true);
  });

  it("honors explicit merge phase override", async () => {
    mocks.fetchLinearIssue.mockResolvedValue({
      id: "issue-1",
      identifier: "WES-21",
      title: "Recovery",
      description: `## Target repo\n\nweston-uribe/weston-uribe-portfolio\n\n## Task\n\nTest\n\n## Acceptance criteria\n\n- [ ] Done\n\n## Out of scope\n\n- [ ] N/A`,
      status: "Merging",
      projectName: "Portfolio",
      teamName: "WES",
      teamId: "team-1",
      url: "https://linear.app/example/issue/WES-21",
    });

    const result = await resolveRoute({
      issueKey: "WES-21",
      configPath,
      phase: "merge",
      linearApiKey: "test-key",
    });

    expect(result.phase).toBe("merge");
    expect(result.shouldRun).toBe(true);
  });

  it("returns shouldRun false for ineligible status with auto phase", async () => {
    mocks.fetchLinearIssue.mockResolvedValue({
      id: "issue-1",
      identifier: "WES-21",
      title: "Idle",
      description: `## Target repo\n\nweston-uribe/weston-uribe-portfolio\n\n## Task\n\nTest\n\n## Acceptance criteria\n\n- [ ] Done\n\n## Out of scope\n\n- [ ] N/A`,
      status: "Backlog",
      projectName: "Portfolio",
      teamName: "WES",
      teamId: "team-1",
      url: "https://linear.app/example/issue/WES-21",
    });

    const result = await resolveRoute({
      issueKey: "WES-21",
      configPath,
      linearApiKey: "test-key",
    });

    expect(result.phase).toBe("none");
    expect(result.shouldRun).toBe(false);
  });
});
