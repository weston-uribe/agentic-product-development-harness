import { describe, expect, it, vi, beforeEach } from "vitest";
import { GitHubApiError } from "../../src/github/client.js";
import {
  parseTargetRepoUrl,
  verifyCursorToken,
  verifyGitHubRepoAccess,
  verifyGitHubToken,
  verifyLinearToken,
} from "../../src/setup/service-verification.js";

const SENTINEL_LINEAR = "sentinel-linear-token-abc";
const SENTINEL_GITHUB = "ghp_sentinelGitHubTokenValue";
const SENTINEL_CURSOR = "cursor_sentinel_api_key_value";

vi.mock("../../src/linear/client.js", () => ({
  pingLinear: vi.fn(),
}));

vi.mock("../../src/github/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/github/client.js")>();
  return {
    ...actual,
    pingGitHub: vi.fn(),
    GitHubClient: vi.fn(),
  };
});

vi.mock("@cursor/sdk", () => ({
  Cursor: {
    models: {
      list: vi.fn(),
    },
    repositories: {
      list: vi.fn(),
    },
  },
}));

import { pingLinear } from "../../src/linear/client.js";
import { GitHubClient, pingGitHub } from "../../src/github/client.js";

async function getCursorSdk() {
  return import("@cursor/sdk");
}

describe("service-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses valid GitHub target repo URLs", () => {
    expect(parseTargetRepoUrl("https://github.com/acme/my-product")).toEqual({
      owner: "acme",
      repo: "my-product",
      slug: "acme/my-product",
      normalizedUrl: "https://github.com/acme/my-product",
    });
    expect(parseTargetRepoUrl("not-a-url")).toBeNull();
  });

  it("verifies Linear tokens without leaking secrets on failure", async () => {
    vi.mocked(pingLinear).mockResolvedValueOnce("Weston Uribe");
    const success = await verifyLinearToken(SENTINEL_LINEAR);
    expect(success.status).toBe("connected");
    expect(success.label).toBe("Weston Uribe");

    vi.mocked(pingLinear).mockRejectedValueOnce(
      new Error(`Unauthorized for ${SENTINEL_LINEAR}`),
    );
    const failure = await verifyLinearToken(SENTINEL_LINEAR);
    expect(failure.status).toBe("failed");
    expect(failure.message).toContain("Linear rejected");
    expect(failure.message).not.toContain(SENTINEL_LINEAR);
  });

  it("verifies GitHub tokens without leaking secrets on failure", async () => {
    vi.mocked(pingGitHub).mockResolvedValueOnce("weston-uribe");
    const success = await verifyGitHubToken(SENTINEL_GITHUB);
    expect(success.status).toBe("connected");
    expect(success.label).toBe("weston-uribe");

    vi.mocked(pingGitHub).mockRejectedValueOnce(
      new GitHubApiError(401, SENTINEL_GITHUB),
    );
    const failure = await verifyGitHubToken(SENTINEL_GITHUB);
    expect(failure.status).toBe("failed");
    expect(failure.message).toContain("GitHub rejected");
    expect(failure.message).not.toContain(SENTINEL_GITHUB);
  });

  it("verifies Cursor tokens via models.list and labels limitations honestly", async () => {
    const { Cursor } = await getCursorSdk();
    vi.mocked(Cursor.models.list).mockResolvedValueOnce([
      { id: "composer-2.5" },
    ] as never);
    vi.mocked(Cursor.repositories.list).mockResolvedValueOnce([
      { url: "https://github.com/acme/repo" },
    ] as never);

    const success = await verifyCursorToken(SENTINEL_CURSOR);
    expect(success.status).toBe("connected");
    expect(success.message).toContain("Cursor API key accepted");
    expect(success.limitation).toContain("does not guarantee");

    vi.mocked(Cursor.models.list).mockRejectedValueOnce(
      new Error(`401 unauthorized ${SENTINEL_CURSOR}`),
    );
    const failure = await verifyCursorToken(SENTINEL_CURSOR);
    expect(failure.status).toBe("failed");
    expect(failure.message).toContain("Cursor rejected");
    expect(failure.message).not.toContain(SENTINEL_CURSOR);
  });

  it("fails invalid repo URLs before network calls", async () => {
    const result = await verifyGitHubRepoAccess({
      token: SENTINEL_GITHUB,
      targetRepo: "not-a-github-url",
    });
    expect(result.status).toBe("failed");
    expect(result.message).toContain("valid GitHub repo URL");
    expect(GitHubClient).not.toHaveBeenCalled();
  });

  it("maps repo access failures to PM-readable messages", async () => {
    vi.mocked(GitHubClient).mockImplementation(
      () =>
        ({
          getRepository: vi.fn().mockRejectedValue(
            new GitHubApiError(404, "Not Found"),
          ),
        }) as never,
    );

    const result = await verifyGitHubRepoAccess({
      token: SENTINEL_GITHUB,
      targetRepo: "https://github.com/acme/private-repo",
    });

    expect(result.status).toBe("failed");
    expect(result.repoSlug).toBe("acme/private-repo");
    expect(result.message).toContain("not found");
    expect(result.message).not.toContain(SENTINEL_GITHUB);
  });

  it("reports connected repo access when GitHub returns readable permissions", async () => {
    vi.mocked(GitHubClient).mockImplementation(
      () =>
        ({
          getRepository: vi.fn().mockResolvedValue({
            permissions: { pull: true },
          }),
        }) as never,
    );

    const result = await verifyGitHubRepoAccess({
      token: SENTINEL_GITHUB,
      targetRepo: "https://github.com/acme/my-product",
    });

    expect(result.status).toBe("connected");
    expect(result.repoSlug).toBe("acme/my-product");
    expect(result.message).toContain("Connected to acme/my-product");
  });
});
