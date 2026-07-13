import { describe, expect, it } from "vitest";
import {
  blockedCategoryMessage,
  classifyWorkflowInstallMergeRejection,
} from "../../src/setup/workflow-install-merge-errors.js";
import { GitHubApiError } from "../../src/github/client.js";

describe("workflow-install-merge-errors", () => {
  it("classifies permission denial", () => {
    const result = classifyWorkflowInstallMergeRejection({
      error: new GitHubApiError(403, "Resource not accessible by integration"),
    });
    expect(result.category).toBe("permission-denied");
    expect(result.waiting).toBe(false);
  });

  it("classifies pending checks as waiting", () => {
    const result = classifyWorkflowInstallMergeRejection({
      error: new GitHubApiError(422, "Required status check is pending"),
    });
    expect(result.category).toBe("checks-pending");
    expect(result.waiting).toBe(true);
  });

  it("classifies merge conflict", () => {
    const result = classifyWorkflowInstallMergeRejection({
      error: new GitHubApiError(409, "Head branch was modified"),
      mergeableState: "dirty",
    });
    expect(result.category).toBe("merge-conflict");
  });

  it("exposes PM-readable blocked messages without secrets", () => {
    const message = blockedCategoryMessage("unexpected-pr-content");
    expect(message).toContain("unexpected");
    expect(message).not.toMatch(/ghp_|Bearer /);
  });
});
