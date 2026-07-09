import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateEnvContent, writeEnvLocal } from "../../src/setup/env-writer.js";
import { resolveLocalFilePaths } from "../../src/setup/setup-state.js";

describe("generateEnvContent", () => {
  it("includes required local env keys", () => {
    const content = generateEnvContent();

    expect(content).toContain("HARNESS_CONFIG_PATH=.harness/config.local.json");
    expect(content).toContain("LINEAR_API_KEY=");
    expect(content).toContain("CURSOR_API_KEY=");
    expect(content).toContain("GITHUB_TOKEN=");
    expect(content).toContain("HARNESS_CONFIG_JSON_B64");
    expect(content).toContain("do NOT put in .env.local");
  });
});

describe("writeEnvLocal", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-env-writer-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("dry-run does not write .env.local", async () => {
    const paths = resolveLocalFilePaths(tempRoot);
    const result = await writeEnvLocal({
      paths,
      mode: "dry-run",
      input: {},
    });

    expect(result.outcome).toBe("preview");
    await expect(access(paths.envLocal)).rejects.toThrow();
  });

  it("apply writes only .env.local", async () => {
    const paths = resolveLocalFilePaths(tempRoot);
    const result = await writeEnvLocal({
      paths,
      mode: "apply",
      input: {},
    });

    expect(result.outcome).toBe("changed");
    const envLocal = await readFile(paths.envLocal, "utf8");
    expect(envLocal).toContain("HARNESS_CONFIG_PATH=.harness/config.local.json");
    await expect(access(paths.configLocal)).rejects.toThrow();
  });
});
