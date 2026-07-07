import { describe, expect, it } from "vitest";
import { extractTargetRepoGitResult } from "../../src/cursor/git-result.js";

describe("extractTargetRepoGitResult", () => {
  it("extracts branch and PR URL for target repo", () => {
    const result = extractTargetRepoGitResult(
      {
        branches: [
          {
            repoUrl: "https://github.com/weston-uribe/weston-uribe-portfolio",
            branch: "cursor/wes-12-hello-world",
            prUrl:
              "https://github.com/weston-uribe/weston-uribe-portfolio/pull/12",
          },
        ],
      },
      "https://github.com/weston-uribe/weston-uribe-portfolio",
    );

    expect(result.branch).toBe("cursor/wes-12-hello-world");
    expect(result.prUrl).toContain("/pull/12");
  });

  it("accepts SDK repoUrl without protocol (WES-12 regression)", () => {
    const result = extractTargetRepoGitResult(
      {
        branches: [
          {
            repoUrl: "github.com/weston-uribe/weston-uribe-portfolio",
            branch: "cursor/wes-12-m3-implementation-integration-test-portfolio-hel",
            prUrl:
              "https://github.com/weston-uribe/weston-uribe-portfolio/pull/3",
          },
        ],
      },
      "https://github.com/weston-uribe/weston-uribe-portfolio",
    );

    expect(result.branch).toContain("wes-12");
    expect(result.prUrl).toContain("/pull/3");
  });

  it("rejects wrong repo metadata", () => {
    expect(() =>
      extractTargetRepoGitResult(
        {
          branches: [
            {
              repoUrl:
                "https://github.com/weston-uribe/agentic-product-development-harness",
              branch: "cursor/wes-12-hello-world",
              prUrl:
                "https://github.com/weston-uribe/agentic-product-development-harness/pull/1",
            },
          ],
        },
        "https://github.com/weston-uribe/weston-uribe-portfolio",
      ),
    ).toThrow(/normalized:/);
  });

  it("rejects branch without PR", () => {
    expect(() =>
      extractTargetRepoGitResult(
        {
          branches: [
            {
              repoUrl: "https://github.com/weston-uribe/weston-uribe-portfolio",
              branch: "cursor/wes-12-hello-world",
            },
          ],
        },
        "https://github.com/weston-uribe/weston-uribe-portfolio",
      ),
    ).toThrow(/without a PR/);
  });
});
