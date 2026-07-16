// Prerequisite: npx playwright install chromium
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  testDir: path.join(repoRoot, "scripts"),
  testMatch: "workflow-browser-matrix.spec.ts",
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: {
    command:
      "P_DEV_OBSERVABILITY_DISABLED=1 P_DEV_OPERATIONS_FIXTURES=1 npx tsx src/gui/start-gui.ts --port 3100",
    cwd: repoRoot,
    url: "http://localhost:3100/workflow?source=fixture&fixture=branching-pr-review&scope=harness-repo",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  outputDir: "/tmp/workflow-validation/playwright-results",
});
