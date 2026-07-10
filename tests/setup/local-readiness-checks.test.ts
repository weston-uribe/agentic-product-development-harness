import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

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
import { runLocalReadinessChecks } from "../../src/setup/local-readiness-checks.js";

const CONFIG_EXAMPLE = JSON.stringify(
  {
    version: 1,
    orchestratorMarker: "harness-orchestrator-v1",
    logDirectory: "runs",
    repos: [
      {
        id: "my-product",
        linearProjects: ["My Product"],
        targetRepo: "https://github.com/acme/my-product",
        baseBranch: "dev",
        productionBranch: "main",
      },
    ],
    allowedTargetRepos: ["https://github.com/acme/my-product"],
  },
  null,
  2,
);

describe("local-readiness-checks", () => {
  let tempRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "harness-readiness-"));
    await mkdir(path.join(tempRoot, ".harness"), { recursive: true });
    await writeFile(
      path.join(tempRoot, ".env.local"),
      [
        "HARNESS_CONFIG_PATH=.harness/config.local.json",
        "LINEAR_API_KEY=lin_test_key",
        "CURSOR_API_KEY=cur_test_key",
        "GITHUB_TOKEN=ghp_test_token",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(tempRoot, ".harness", "config.local.json"),
      CONFIG_EXAMPLE,
      "utf8",
    );

    vi.mocked(pingLinear).mockResolvedValue("Weston Uribe");
    vi.mocked(pingGitHub).mockResolvedValue("weston-uribe");
    vi.mocked(GitHubClient).mockImplementation(
      () =>
        ({
          getRepository: vi.fn().mockResolvedValue({
            permissions: { pull: true, push: true },
          }),
        }) as unknown as InstanceType<typeof GitHubClient>,
    );

    const cursorSdk = await import("@cursor/sdk");
    vi.mocked(cursorSdk.Cursor.models.list).mockResolvedValue([{ id: "composer-2.5" }]);
    vi.mocked(cursorSdk.Cursor.repositories.list).mockResolvedValue([]);
  });

  it("runs GUI-owned local readiness checks without CLI-only skipped rows", async () => {
    const result = await runLocalReadinessChecks({ cwd: tempRoot });

    expect(result.allPassed).toBe(true);
    expect(result.checks.some((check) => check.label === "Linear API key works")).toBe(
      true,
    );
    expect(result.checks.some((check) => check.label === "Cursor API key works")).toBe(
      true,
    );
    expect(result.checks.some((check) => check.label === "GitHub token works")).toBe(
      true,
    );
    expect(
      result.checks.some((check) =>
        check.label.includes("Target repo acme/my-product is accessible"),
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("CLI-only");
    expect(JSON.stringify(result)).not.toContain("Milestone 3");
    expect(JSON.stringify(result)).not.toContain("npm run harness:doctor");
  });

  it("marks saved provider keys as failed when verification fails", async () => {
    vi.mocked(pingLinear).mockRejectedValueOnce(new Error("Unauthorized"));

    const result = await runLocalReadinessChecks({ cwd: tempRoot });
    const linear = result.checks.find((check) => check.id === "linear-key");

    expect(linear?.status).toBe("failed");
    expect(linear?.action).toContain("Step 1");
    expect(result.allPassed).toBe(false);
  });
});
