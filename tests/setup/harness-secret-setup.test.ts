import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildHarnessSecretWritePlan,
  generateHarnessConfigJsonB64,
  previewHarnessSecretSetup,
  readValidatedConfigLocalBytes,
} from "../../src/setup/harness-secret-setup.js";

const FAKE_SECRETS = {
  linearApiKey: "fake-linear-secret-value",
  cursorApiKey: "fake-cursor-secret-value",
  githubToken: "fake-github-secret-value",
};

describe("harness-secret-setup", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-secret-setup-"));
    const harnessDir = path.join(tempRoot, ".harness");
    await mkdir(harnessDir, { recursive: true });
    await writeFile(
      path.join(harnessDir, "config.local.json"),
      JSON.stringify(
        {
          version: 1,
          repos: [
            {
              id: "target-app",
              targetRepo: "https://github.com/owner/example-target-app",
            },
          ],
          allowedTargetRepos: ["https://github.com/owner/example-target-app"],
        },
        null,
        2,
      ),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("generates HARNESS_CONFIG_JSON_B64 from validated config bytes", async () => {
    const { bytes } = await readValidatedConfigLocalBytes(tempRoot);
    const encoded = generateHarnessConfigJsonB64(bytes);
    expect(encoded.length).toBeGreaterThan(0);
    expect(Buffer.from(encoded, "base64").toString("utf8")).toContain(
      "target-app",
    );
  });

  it("builds secret write plan with key names only in preview summary", async () => {
    const plan = buildHarnessSecretWritePlan({
      operatorInput: FAKE_SECRETS,
      configLocalExists: true,
      secretStatuses: [
        { name: "LINEAR_API_KEY", status: "missing" },
        { name: "CURSOR_API_KEY", status: "missing" },
        { name: "HARNESS_GITHUB_TOKEN", status: "missing" },
        { name: "HARNESS_CONFIG_JSON_B64", status: "missing" },
      ],
    });

    const preview = await previewHarnessSecretSetup({
      cwd: tempRoot,
      operatorInput: FAKE_SECRETS,
      manualHarnessDispatchRepo: "owner/harness-repo",
    });
    const serialized = JSON.stringify({ plan, preview });

    expect(plan.some((entry) => entry.name === "HARNESS_CONFIG_JSON_B64")).toBe(
      true,
    );
    expect(preview.previewSummary).toContain("HARNESS_CONFIG_JSON_B64");
    expect(preview.previewSummary).not.toContain(FAKE_SECRETS.linearApiKey);
    expect(serialized).not.toContain(FAKE_SECRETS.linearApiKey);
    expect(serialized).not.toContain(FAKE_SECRETS.cursorApiKey);
    expect(serialized).not.toContain(FAKE_SECRETS.githubToken);
  });
});
