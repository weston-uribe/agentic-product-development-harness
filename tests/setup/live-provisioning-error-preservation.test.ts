import { describe, expect, it, vi } from "vitest";
import { GitHubApiError, GitHubClient } from "../../src/github/client.js";
import {
  LiveGitHubHarnessProvisioningProvider,
  preserveGitHubSetupError,
} from "../../src/setup/github-remote-setup-live.js";
import { isRetryableGitHubError } from "../../src/setup/harness-snapshot-provisioning.js";

describe("preserveGitHubSetupError", () => {
  it("preserves GitHubApiError status while redacting token-like content", () => {
    const error = new GitHubApiError(
      429,
      "GitHub API 429: token ghp_sentinelGitHubTokenValue leaked",
    );
    const preserved = preserveGitHubSetupError(error);
    expect(preserved).toBeInstanceOf(GitHubApiError);
    expect((preserved as GitHubApiError).status).toBe(429);
    expect(preserved.message).not.toContain("ghp_sentinelGitHubTokenValue");
    expect(preserved.message).toContain("429");
  });

  it("preserves 422 status for reconciliation paths", () => {
    const error = new GitHubApiError(422, '{"message":"Repository creation failed."}');
    const preserved = preserveGitHubSetupError(error);
    expect(preserved).toBeInstanceOf(GitHubApiError);
    expect((preserved as GitHubApiError).status).toBe(422);
  });
});

describe("LiveGitHubHarnessProvisioningProvider error preservation", () => {
  it("rethrows GitHubApiError with status from createGitBlob", async () => {
    const client = new GitHubClient({ token: "test-token" });
    vi.spyOn(client, "createGitBlob").mockRejectedValue(
      new GitHubApiError(429, "rate limit exceeded"),
    );
    const provider = new LiveGitHubHarnessProvisioningProvider(client);
    await expect(
      provider.createGitBlob({
        owner: "test-user",
        repo: "repo",
        content: Buffer.from("x"),
      }),
    ).rejects.toMatchObject({ status: 429, name: "GitHubApiError" });
  });

  it("rethrows GitHubApiError with status from createUserRepository", async () => {
    const client = new GitHubClient({ token: "test-token" });
    vi.spyOn(client, "createUserRepository").mockRejectedValue(
      new GitHubApiError(422, '{"message":"name already exists"}'),
    );
    const provider = new LiveGitHubHarnessProvisioningProvider(client);
    await expect(
      provider.createUserRepository({
        name: "repo",
        description: "test",
        private: true,
        autoInit: true,
      }),
    ).rejects.toMatchObject({ status: 422, name: "GitHubApiError" });
  });
});

describe("isRetryableGitHubError", () => {
  it("retries preserved 429 errors", () => {
    const error = preserveGitHubSetupError(
      new GitHubApiError(429, "secondary rate limit"),
    );
    expect(isRetryableGitHubError(error)).toBe(true);
  });

  it("does not retry preserved 422 errors", () => {
    const error = preserveGitHubSetupError(
      new GitHubApiError(422, '{"message":"validation failed"}'),
    );
    expect(isRetryableGitHubError(error)).toBe(false);
  });
});
