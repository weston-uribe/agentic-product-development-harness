// Prerequisite: npx playwright install chromium
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDir = path.join(
  tmpdir(),
  `cursor-usage-browser-${process.pid}-${Date.now()}`,
);
const fakeLangfusePort = 18999;
const guiPort = 3131;
const fakeLangfuseBaseUrl = `http://127.0.0.1:${fakeLangfusePort}`;

mkdirSync(path.join(workspaceDir, ".harness"), { recursive: true });
writeFileSync(
  path.join(workspaceDir, ".env.local"),
  [
    "HARNESS_CONFIG_PATH=.harness/config.local.json",
    "P_DEV_EVALUATION_PROVIDER=langfuse",
    `LANGFUSE_PUBLIC_KEY=pk-cursor-usage-e2e`,
    `LANGFUSE_SECRET_KEY=sk-cursor-usage-e2e`,
    `LANGFUSE_BASE_URL=${fakeLangfuseBaseUrl}`,
    "P_DEV_EVALUATION_NAMESPACE=default",
  ].join("\n") + "\n",
);
writeFileSync(
  path.join(workspaceDir, ".harness/config.local.json"),
  `${JSON.stringify({ version: 1, logDirectory: "runs", repos: [{ name: "fixture", path: "." }] }, null, 2)}\n`,
);
writeFileSync(
  path.join(workspaceDir, ".harness/observability.local.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      analyticsPreference: "disabled",
      errorReportingPreference: "disabled",
      disclosureShown: true,
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  path.join(workspaceDir, ".harness/control-plane-setup.json"),
  `${JSON.stringify(
    {
      version: 1,
      linearWorkspace: {
        workspaceId: "w",
        workspaceName: "W",
        teams: [
          {
            teamId: "t",
            teamKey: "TT",
            teamName: "Team",
            projects: [],
            health: "verification_pending",
          },
        ],
      },
      runnerUpgrade: {
        appliedSnapshotContentId: "abc",
        status: "up_to_date",
      },
    },
    null,
    2,
  )}\n`,
);

writeFileSync("/tmp/cursor-usage-browser-workspace.txt", `${workspaceDir}\n`, "utf8");
process.env.CURSOR_USAGE_BROWSER_WORKSPACE = workspaceDir;

export default defineConfig({
  testDir: path.join(repoRoot, "scripts"),
  testMatch: "cursor-usage-import-browser.spec.ts",
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${guiPort}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `npx tsx scripts/cursor-usage-fake-langfuse-server.ts`,
      cwd: repoRoot,
      url: `${fakeLangfuseBaseUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        CURSOR_USAGE_FAKE_LANGFUSE_PORT: String(fakeLangfusePort),
      },
    },
    {
      command: [
        `P_DEV_HOME=${workspaceDir}`,
        `HARNESS_GUI_PORT=${guiPort}`,
        "HARNESS_GUI_HOST=127.0.0.1",
        `P_DEV_EVALUATION_PROVIDER=langfuse`,
        `LANGFUSE_PUBLIC_KEY=pk-cursor-usage-e2e`,
        `LANGFUSE_SECRET_KEY=sk-cursor-usage-e2e`,
        `LANGFUSE_BASE_URL=${fakeLangfuseBaseUrl}`,
        "P_DEV_EVALUATION_NAMESPACE=default",
        `node bin/p-dev-dev.js --port ${guiPort} --no-open`,
      ].join(" "),
      cwd: repoRoot,
      url: `http://127.0.0.1:${guiPort}/settings/cursor-usage`,
      reuseExistingServer: false,
      timeout: 420_000,
    },
  ],
  outputDir: "/tmp/cursor-usage-browser/playwright-results",
});
