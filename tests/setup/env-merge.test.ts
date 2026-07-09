import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateMergedEnvContent,
  mergeEnvInput,
  parseEnvFileContent,
  readExistingEnvFile,
  redactEnvContent,
} from "../../src/setup/env-merge.js";
import { resolveLocalFilePaths } from "../../src/setup/setup-state.js";

const EXISTING_LINEAR = "existing-linear-secret-abc";
const NEW_CURSOR = "new-cursor-secret-xyz";

describe("env-merge", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-env-merge-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("preserves existing secret when submitted field is blank", () => {
    const existing = parseEnvFileContent(
      `HARNESS_CONFIG_PATH=.harness/config.local.json\nLINEAR_API_KEY=${EXISTING_LINEAR}\n`,
    );

    const merged = mergeEnvInput(existing, {
      harnessConfigPath: ".harness/config.local.json",
    });

    expect(merged.linearApiKey).toBe(EXISTING_LINEAR);
    expect(merged.cursorApiKey).toBeUndefined();
  });

  it("replaces existing secret when submitted field is non-blank", () => {
    const existing = parseEnvFileContent(
      `LINEAR_API_KEY=${EXISTING_LINEAR}\n`,
    );

    const merged = mergeEnvInput(existing, {
      cursorApiKey: NEW_CURSOR,
    });

    expect(merged.linearApiKey).toBe(EXISTING_LINEAR);
    expect(merged.cursorApiKey).toBe(NEW_CURSOR);
  });

  it("redacts preview content without exposing raw secret values", () => {
    const content = generateMergedEnvContent({
      harnessConfigPath: ".harness/config.local.json",
      linearApiKey: EXISTING_LINEAR,
      cursorApiKey: NEW_CURSOR,
      githubToken: "github-token-secret",
    });

    const redacted = redactEnvContent(content);

    expect(redacted).toContain("LINEAR_API_KEY=<redacted>");
    expect(redacted).not.toContain(EXISTING_LINEAR);
    expect(redacted).not.toContain(NEW_CURSOR);
    expect(redacted).not.toContain("github-token-secret");
  });

  it("creates valid generated content when no existing file", () => {
    const merged = mergeEnvInput(null, {
      harnessConfigPath: ".harness/config.local.json",
      linearApiKey: EXISTING_LINEAR,
    });
    const content = generateMergedEnvContent(merged);

    expect(content).toContain("HARNESS_CONFIG_PATH=.harness/config.local.json");
    expect(content).toContain(`LINEAR_API_KEY=${EXISTING_LINEAR}`);
  });

  it("reads existing env file without exposing values in API helpers", async () => {
    const paths = resolveLocalFilePaths(tempRoot);
    await writeFile(
      paths.envLocal,
      `LINEAR_API_KEY=${EXISTING_LINEAR}\n`,
      "utf8",
    );

    const parsed = await readExistingEnvFile(paths);

    expect(parsed?.presence.LINEAR_API_KEY).toBe(true);
    expect(parsed?.values.LINEAR_API_KEY).toBe(EXISTING_LINEAR);
    expect(JSON.stringify(parsed?.presence)).not.toContain(EXISTING_LINEAR);
  });
});
