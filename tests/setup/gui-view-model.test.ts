import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectLocalDoctorChecks,
  getSetupStateSummary,
  summarizeEnvKeyPresence,
} from "../../src/setup/gui-view-model.js";

const CONFIG_EXAMPLE = JSON.stringify(
  {
    version: 1,
    orchestratorMarker: "harness-orchestrator-v1",
    logDirectory: "runs",
    repos: [
      {
        id: "target-app",
        linearProjects: ["Example Target App"],
        targetRepo: "https://github.com/owner/example-target-app",
        baseBranch: "dev",
        productionBranch: "main",
      },
    ],
    allowedTargetRepos: ["https://github.com/owner/example-target-app"],
  },
  null,
  2,
);

describe("gui-view-model", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-gui-summary-"));
    await writeFile(
      path.join(tempRoot, "harness.config.json"),
      CONFIG_EXAMPLE,
      "utf8",
    );
    await writeFile(
      path.join(tempRoot, ".env.example"),
      "HARNESS_CONFIG_PATH=.harness/config.local.json\nLINEAR_API_KEY=\n",
      "utf8",
    );
    const harnessDir = path.join(tempRoot, ".harness");
    await mkdir(harnessDir, { recursive: true });
    await writeFile(
      path.join(harnessDir, "config.example.json"),
      CONFIG_EXAMPLE,
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("summarizes env key presence without reading secret values into output", async () => {
    const envPath = path.join(tempRoot, ".env.local");
    await writeFile(
      envPath,
      [
        "HARNESS_CONFIG_PATH=.harness/config.local.json",
        "LINEAR_API_KEY=super-secret-linear",
        "CURSOR_API_KEY=",
      ].join("\n"),
      "utf8",
    );

    const presence = await summarizeEnvKeyPresence(envPath);

    expect(presence.HARNESS_CONFIG_PATH).toBe(true);
    expect(presence.LINEAR_API_KEY).toBe(true);
    expect(presence.CURSOR_API_KEY).toBe(false);
    expect(JSON.stringify(presence)).not.toContain("super-secret-linear");
  });

  it("builds a setup summary without writing local files", async () => {
    const summary = await getSetupStateSummary({ cwd: tempRoot });
    const serialized = JSON.stringify(summary);

    expect(summary.localFiles.some((file) => file.label === ".env.local")).toBe(
      true,
    );
    expect(summary.missingSteps.length).toBeGreaterThan(0);
    expect(summary.generatedPreviews.envLocal).toContain("HARNESS_CONFIG_PATH=");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toMatch(/LINEAR_API_KEY=[A-Za-z0-9_-]{8,}/);
  });

  it("collects local doctor checks without creating runs/", async () => {
    const checks = await collectLocalDoctorChecks({
      cwd: tempRoot,
      config: JSON.parse(CONFIG_EXAMPLE),
      envLocalExists: false,
      configLocalExists: false,
    });

    expect(checks.some((check) => check.label === ".env.local present")).toBe(
      true,
    );
    expect(
      checks.some(
        (check) =>
          check.skipped &&
          check.label === "LINEAR_API_KEY set",
      ),
    ).toBe(true);
    await expect(
      import("node:fs/promises").then((fs) =>
        fs.access(path.join(tempRoot, "runs")),
      ),
    ).rejects.toThrow();
  });
});
