import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubClient, GitHubApiError } from "../../src/github/client.js";

const mockFetch = vi.fn();

describe("GitHubClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks draft PR ready via GraphQL mutation", async () => {
    const pull = {
      node_id: "PR_kwDOExample",
      title: "[WES-18] test",
      html_url: "https://github.com/weston-uribe/weston-uribe-portfolio/pull/7",
      state: "open",
      merged: false,
      draft: true,
      merged_at: null,
      merge_commit_sha: null,
      head: { ref: "cursor/wes-18-test", sha: "abc123" },
      base: { ref: "main" },
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => pull,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            markPullRequestReadyForReview: {
              pullRequest: { isDraft: false },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...pull, draft: false }),
      });

    const client = new GitHubClient({ token: "test-token" });
    const result = await client.markPullRequestReadyForReview(
      "weston-uribe",
      "weston-uribe-portfolio",
      7,
    );

    expect(result.draft).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const graphqlCall = mockFetch.mock.calls[1];
    expect(graphqlCall[0]).toBe("https://api.github.com/graphql");
    expect(graphqlCall[1]?.method).toBe("POST");
    const body = JSON.parse(String(graphqlCall[1]?.body));
    expect(body.variables.pullRequestId).toBe("PR_kwDOExample");
    expect(body.query).toContain("markPullRequestReadyForReview");
    const patchCalls = mockFetch.mock.calls.filter(
      ([url, init]) =>
        String(url).includes("/pulls/7") && init?.method === "PATCH",
    );
    expect(patchCalls).toHaveLength(0);
  });

  it("throws when GraphQL mutation returns errors", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          node_id: "PR_kwDOExample",
          title: "test",
          html_url: "https://github.com/example/repo/pull/1",
          state: "open",
          merged: false,
          draft: true,
          merged_at: null,
          merge_commit_sha: null,
          head: { ref: "branch", sha: "abc" },
          base: { ref: "main" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: "Resource not accessible by integration" }],
        }),
      });

    const client = new GitHubClient({ token: "test-token" });
    await expect(
      client.markPullRequestReadyForReview("owner", "repo", 1),
    ).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("updates a PR branch with expected head sha", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ message: "Updating pull request branch." }),
    });

    const client = new GitHubClient({ token: "test-token" });
    const result = await client.updatePullRequestBranch("owner", "repo", 12, {
      expectedHeadSha: "abc123",
    });

    expect(result.message).toContain("Updating");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe(
      "https://api.github.com/repos/owner/repo/pulls/12/update-branch",
    );
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      expected_head_sha: "abc123",
    });
  });
});
