import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const liveWorkflowPath = path.join(repoRoot, ".github/workflows/harness-auto-runner.yml");
const fixtureWorkflowPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/workflows/harness-auto-runner-with-production-sync.yml",
);

function extractJobSection(workflow: string, jobName: string): string {
  const marker = `${jobName}:`;
  const start = workflow.indexOf(marker);
  if (start === -1) {
    throw new Error(`Job ${jobName} not found`);
  }
  const rest = workflow.slice(start + marker.length);
  const nextJob = rest.search(/\n  [a-z][a-z0-9-]+:\n/);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

function assertHarnessWorkflowContracts(workflow: string, label: string): void {
  describe(`${label} workflow contract`, () => {
    it("subscribes to production_promoted repository_dispatch", () => {
      expect(workflow).toContain("production_promoted");
      expect(workflow).toContain("linear_issue_status_changed");
    });

    it("defines gate job with resolve-route and without required concurrency", () => {
      const gate = extractJobSection(workflow, "gate");
      expect(gate).toContain("harness:resolve-route");
      expect(gate).not.toMatch(/^\s+concurrency:/m);
    });

    it("run-harness keeps per-issue concurrency without canceling in-progress work", () => {
      const runHarness = extractJobSection(workflow, "run-harness");
      expect(runHarness).toMatch(/group:\s*harness-\$\{\{/);
      expect(runHarness).toContain("cancel-in-progress: false");
      expect(runHarness).not.toContain("harness-merge-");
    });

    it("run-merge uses repo/base merge concurrency with cancel-in-progress false", () => {
      const runMerge = extractJobSection(workflow, "run-merge");
      expect(runMerge).toContain("harness-merge-${{ needs.gate.outputs.merge_concurrency_group }}");
      expect(runMerge).toContain("cancel-in-progress: false");
      expect(runMerge).toContain("harness:run");
      expect(runMerge).toContain("--phase merge");
    });

    it("does not treat gate concurrency as sole duplicate protection", () => {
      const gate = extractJobSection(workflow, "gate");
      const runHarness = extractJobSection(workflow, "run-harness");
      expect(gate).not.toMatch(/^\s+concurrency:/m);
      expect(runHarness).toMatch(/^\s+concurrency:/m);
    });

    it("defines sync-production job gated on production_promoted", () => {
      expect(workflow).toContain("sync-production:");
      expect(workflow).toContain("github.event.action == 'production_promoted'");
      expect(workflow).toContain("harness:sync-production");
    });

    it("uses harness secrets for sync without CURSOR_API_KEY", () => {
      const syncSection = extractJobSection(workflow, "sync-production");
      expect(syncSection).toContain("LINEAR_API_KEY");
      expect(syncSection).toContain("HARNESS_GITHUB_TOKEN");
      expect(syncSection).not.toContain("CURSOR_API_KEY");
      expect(syncSection).not.toContain("harness:doctor");
    });

    it("supports workflow_dispatch sync_repo input", () => {
      expect(workflow).toContain("sync_repo:");
    });
  });
}

describe("harness-auto-runner workflow contracts", () => {
  assertHarnessWorkflowContracts(readFileSync(liveWorkflowPath, "utf8"), "live");
  assertHarnessWorkflowContracts(readFileSync(fixtureWorkflowPath, "utf8"), "fixture");
});

describe("harness-auto-runner concurrency behavior contracts", () => {
  const workflow = readFileSync(liveWorkflowPath, "utf8");
  const runHarness = extractJobSection(workflow, "run-harness");
  const runMerge = extractJobSection(workflow, "run-merge");

  it("duplicate same-issue non-merge dispatch queues via run-harness concurrency without cancel", () => {
    expect(runHarness).toContain("group: harness-${{ needs.gate.outputs.issue_key }}");
    expect(runHarness).toContain("cancel-in-progress: false");
  });

  it("duplicate same-issue merge dispatch queues via run-merge concurrency without cancel", () => {
    expect(runMerge).toContain("harness-merge-${{ needs.gate.outputs.merge_concurrency_group }}");
    expect(runMerge).toContain("cancel-in-progress: false");
  });

  it("different issues in non-merge phases use distinct run-harness groups", () => {
    expect(runHarness).toContain("needs.gate.outputs.issue_key");
  });

  it("different issues targeting same repo/base branch share merge queue group output", () => {
    expect(runMerge).toContain("needs.gate.outputs.merge_concurrency_group");
  });
});
