import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { harnessConfigSchema } from "../../src/config/schema.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/config",
);

describe("harness config schema", () => {
  it("accepts minimal valid config", async () => {
    const raw = await readFile(path.join(fixturesDir, "minimal.json"), "utf8");
    const parsed = harnessConfigSchema.parse(JSON.parse(raw));
    expect(parsed.repos).toHaveLength(1);
  });

  it("rejects unknown top-level keys", () => {
    const result = harnessConfigSchema.safeParse({
      version: 1,
      repos: [],
      allowedTargetRepos: ["https://github.com/o/r"],
      unexpected: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects repo mapping not in allowlist via loadConfig closure", async () => {
    const configPath = path.join(fixturesDir, "minimal.json");
    const raw = JSON.parse(await readFile(configPath, "utf8"));
    raw.repos[0].targetRepo = "https://github.com/other/forbidden";
    const tempDir = await mkdtemp(path.join(tmpdir(), "harness-config-"));
    const tempPath = path.join(tempDir, "invalid-allowlist.json");
    await writeFile(tempPath, JSON.stringify(raw), "utf8");

    await expect(loadConfig(tempPath)).rejects.toThrow(
      /not listed in allowedTargetRepos/,
    );

    await rm(tempDir, { recursive: true, force: true });
  });
});
