import { describe, expect, it, vi } from "vitest";
import { GitHubApiError } from "../../src/github/client.js";
import {
  assertBaseBranchExists,
  assertPrBaseBranchMatches,
  parseGitHubRepoUrl,
} from "../../src/github/base-branch.js";

describe("parseGitHubRepoUrl", () => {
  it("parses canonical GitHub HTTPS URLs", () => {
    expect(
      parseGitHubRepoUrl("https://github.com/weston-uribe/weston-uribe-portfolio"),
    ).toEqual({
      owner: "weston-uribe",
      repo: "weston-uribe-portfolio",
    });
  });

  it("returns null for invalid URLs", () => {
    expect(parseGitHubRepoUrl("not-a-repo-url")).toBeNull();
  });
});

describe("assertBaseBranchExists", () => {
  it("resolves when branch ref exists", async () => {
    const client = {
      getBranchRef: vi.fn().mockResolvedValue({ object: { sha: "abc" } }),
    };

    await expect(
      assertBaseBranchExists(
        client as never,
        "https://github.com/weston-uribe/weston-uribe-portfolio",
        "dev",
      ),
    ).resolves.toBeUndefined();
  });

  it("throws base_branch_missing when branch ref is 404", async () => {
    const client = {
      getBranchRef: vi
        .fn()
        .mockRejectedValue(new GitHubApiError(404, "Not Found")),
    };

    await expect(
      assertBaseBranchExists(
        client as never,
        "https://github.com/weston-uribe/weston-uribe-portfolio",
        "dev",
      ),
    ).rejects.toThrow(/base_branch_missing/);
  });
});

describe("assertPrBaseBranchMatches", () => {
  it("passes when PR base matches config", () => {
    expect(() =>
      assertPrBaseBranchMatches({
        prUrl: "https://github.com/o/r/pull/1",
        actualBaseBranch: "dev",
        expectedBaseBranch: "dev",
      }),
    ).not.toThrow();
  });

  it("throws wrong_pr_base_branch when PR base differs", () => {
    expect(() =>
      assertPrBaseBranchMatches({
        prUrl: "https://github.com/o/r/pull/1",
        actualBaseBranch: "main",
        expectedBaseBranch: "dev",
      }),
    ).toThrow(/wrong_pr_base_branch/);
  });
});
