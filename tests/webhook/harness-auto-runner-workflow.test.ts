import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflowPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/workflows/harness-auto-runner-with-production-sync.yml",
);

describe("harness-auto-runner workflow contract", () => {
  const workflow = readFileSync(workflowPath, "utf8");

  it("subscribes to production_promoted repository_dispatch", () => {
    expect(workflow).toContain("production_promoted");
    expect(workflow).toContain("linear_issue_status_changed");
  });

  it("defines sync-production job gated on production_promoted", () => {
    expect(workflow).toContain("sync-production:");
    expect(workflow).toContain("github.event.action == 'production_promoted'");
    expect(workflow).toContain("harness:sync-production");
  });

  it("runs harness run job only for linear_issue_status_changed or issue workflow_dispatch", () => {
    expect(workflow).toContain("linear_issue_status_changed");
    expect(workflow).toContain("harness:run");
    expect(workflow).toMatch(/run-harness:[\s\S]*if:/);
  });

  it("uses harness secrets for sync without CURSOR_API_KEY", () => {
    const syncSection = workflow.slice(workflow.indexOf("sync-production:"));
    expect(syncSection).toContain("LINEAR_API_KEY");
    expect(syncSection).toContain("HARNESS_GITHUB_TOKEN");
    expect(syncSection).not.toContain("CURSOR_API_KEY");
  });

  it("supports workflow_dispatch sync_repo input", () => {
    expect(workflow).toContain("sync_repo:");
  });
});
