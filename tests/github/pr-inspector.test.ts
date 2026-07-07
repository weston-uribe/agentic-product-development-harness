import { describe, expect, it, vi } from "vitest";
import { GitHubApiError } from "../../src/github/client.js";
import {
  classifyGitHubError,
  inspectPullRequest,
} from "../../src/github/pr-inspector.js";

function createMockClient(overrides: {
  pull?: Record<string, unknown>;
  files?: { filename: string; status: string }[];
  checks?: { check_runs: Record<string, unknown>[] };
  comments?: { user: { login: string }; body: string; created_at: string }[];
  pullError?: Error;
}) {
  return {
    getPullRequest: vi.fn(async () => {
      if (overrides.pullError) {
        throw overrides.pullError;
      }
      return overrides.pull ?? {
        title: "Test PR",
        html_url: "https://github.com/o/r/pull/4",
        head: { ref: "cursor/wes-13-test", sha: "abc123" },
        base: { ref: "main" },
        state: "open",
        merged: false,
      };
    }),
    getPullRequestFiles: vi.fn(async () => overrides.files ?? []),
    getCheckRunsForRef: vi.fn(async () => overrides.checks ?? { check_runs: [] }),
    getIssueComments: vi.fn(async () => overrides.comments ?? []),
  };
}

describe("inspectPullRequest", () => {
  const parsed = {
    owner: "o",
    repo: "r",
    pullNumber: 4,
    repoUrl: "https://github.com/o/r",
  };

  it("returns inspection details for an open PR", async () => {
    const client = createMockClient({
      files: [{ filename: "src/page.tsx", status: "modified" }],
      checks: {
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
            details_url: "https://github.com/o/r/runs/1",
          },
        ],
      },
      comments: [
        {
          user: { login: "vercel[bot]" },
          body: "[Preview](https://example.vercel.app)",
          created_at: "2026-07-07T00:00:00Z",
        },
      ],
    });

    const result = await inspectPullRequest(
      client as never,
      parsed,
      "https://github.com/o/r",
    );

    expect(result.url).toContain("/pull/4");
    expect(result.branch).toBe("cursor/wes-13-test");
    expect(result.changedFiles).toHaveLength(1);
    expect(result.checkSummary).toContain("Passed: 1");
    expect(result.comments[0]?.author).toBe("vercel[bot]");
  });

  it("throws when PR repo does not match expected target repo", async () => {
    const client = createMockClient({});

    await expect(
      inspectPullRequest(
        client as never,
        parsed,
        "https://github.com/other/repo",
      ),
    ).rejects.toThrow(/wrong_target_repo/);
  });

  it("throws when PR is closed", async () => {
    const client = createMockClient({
      pull: {
        title: "Closed PR",
        html_url: "https://github.com/o/r/pull/4",
        head: { ref: "branch", sha: "abc" },
        base: { ref: "main" },
        state: "closed",
        merged: false,
      },
    });

    await expect(
      inspectPullRequest(client as never, parsed, "https://github.com/o/r"),
    ).rejects.toThrow(/pr_closed/);
  });
});

describe("classifyGitHubError", () => {
  it("classifies 401 as github_auth_failure", () => {
    expect(
      classifyGitHubError(new GitHubApiError(401, "Unauthorized")),
    ).toBe("github_auth_failure");
  });

  it("classifies other errors as github_api_failure", () => {
    expect(classifyGitHubError(new Error("network"))).toBe("github_api_failure");
  });
});
