import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MANUAL_HARNESS_DISPATCH_REPO_PLACEHOLDER,
  parseGitHubRepoSlug,
  resolveHarnessDispatchRepo,
  resolveHarnessDispatchRepoFromInputs,
} from "../../src/setup/harness-dispatch-repo.js";

describe("harness-dispatch-repo", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-dispatch-repo-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("parses https and ssh GitHub remote URLs", () => {
    expect(
      parseGitHubRepoSlug("https://github.com/owner/example-harness.git"),
    ).toBe("owner/example-harness");
    expect(parseGitHubRepoSlug("git@github.com:owner/example-harness.git")).toBe(
      "owner/example-harness",
    );
    expect(parseGitHubRepoSlug("owner/example-harness")).toBe(
      "owner/example-harness",
    );
  });

  it("prefers explicit setup/config value over git remote origin", () => {
    const resolution = resolveHarnessDispatchRepoFromInputs({
      explicitRepo: "explicit-org/explicit-repo",
      gitRemoteOriginUrl: "https://github.com/origin-org/origin-repo.git",
    });

    expect(resolution).toEqual({
      repo: "explicit-org/explicit-repo",
      source: "explicit-config",
      resolved: true,
      detail: "Resolved from explicit setup/config value.",
    });
  });

  it("falls back to git remote origin when explicit value is absent", () => {
    const resolution = resolveHarnessDispatchRepoFromInputs({
      gitRemoteOriginUrl: "https://github.com/origin-org/origin-repo.git",
    });

    expect(resolution.source).toBe("git-remote-origin");
    expect(resolution.repo).toBe("origin-org/origin-repo");
    expect(resolution.resolved).toBe(true);
  });

  it("uses manual fallback when neither explicit nor origin resolve", () => {
    const unresolved = resolveHarnessDispatchRepoFromInputs({});
    expect(unresolved.resolved).toBe(false);
    expect(unresolved.repo).toBeNull();

    const manual = resolveHarnessDispatchRepoFromInputs({
      manualRepo: "manual-org/manual-repo",
    });
    expect(manual.source).toBe("manual");
    expect(manual.repo).toBe("manual-org/manual-repo");
  });

  it("reads GITHUB_DISPATCH_REPOSITORY from .env.local", async () => {
    await writeFile(
      path.join(tempRoot, ".env.local"),
      "GITHUB_DISPATCH_REPOSITORY=env-org/env-repo\n",
      "utf8",
    );

    const resolution = await resolveHarnessDispatchRepo({ cwd: tempRoot });
    expect(resolution.repo).toBe("env-org/env-repo");
    expect(resolution.source).toBe("explicit-config");
  });

  it("reads git remote origin from .git/config", async () => {
    const gitDir = path.join(tempRoot, ".git");
    await mkdir(gitDir, { recursive: true });
    await writeFile(
      path.join(gitDir, "config"),
      `[remote "origin"]\n\turl = https://github.com/git-org/git-repo.git\n`,
      "utf8",
    );

    const resolution = await resolveHarnessDispatchRepo({ cwd: tempRoot });
    expect(resolution.repo).toBe("git-org/git-repo");
    expect(resolution.source).toBe("git-remote-origin");
  });

  it("returns manual placeholder when unresolved", async () => {
    const resolution = await resolveHarnessDispatchRepo({ cwd: tempRoot });
    expect(resolution.resolved).toBe(false);
    expect(resolution.repo).toBeNull();
    expect(MANUAL_HARNESS_DISPATCH_REPO_PLACEHOLDER).toBe(
      "<harness-dispatch-repo>",
    );
  });
});
