import { describe, expect, it } from "vitest";
import { GitHubApiError } from "../../src/github/client.js";
import { sanitizeGitHubSetupError } from "../../src/setup/github-remote-setup-live.js";

describe("github-remote-setup-live", () => {
  it("sanitizes GitHub API error bodies before surfacing messages", () => {
    const error = new GitHubApiError(
      401,
      "GitHub API 401: token ghp_sentinelGitHubTokenValue leaked in body",
    );

    const message = sanitizeGitHubSetupError(error);
    expect(message).not.toContain("ghp_sentinelGitHubTokenValue");
    expect(message).toContain("401");
  });
});
