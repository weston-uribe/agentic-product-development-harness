import { describe, expect, it } from "vitest";
import { checkProductionSyncIdempotency } from "../../src/runner/idempotency.js";
import type { HarnessConfig } from "../../src/config/types.js";
import type { LinearIssueSnapshot } from "../../src/linear/client.js";

const config: HarnessConfig = {
  version: 1,
  orchestratorMarker: "harness-orchestrator-v1",
  logDirectory: "runs",
  linear: {
    transitionalStatuses: {
      mergedToDev: "Merged to Dev",
      mergedDeployed: "Merged / Deployed",
    },
  },
  repos: [
    {
      id: "target-app",
      linearProjects: ["Example Target App"],
      targetRepo: "https://github.com/o/r",
      baseBranch: "dev",
      productionBranch: "main",
      integrationSuccessStatus: "Merged to Dev",
      productionSuccessStatus: "Merged / Deployed",
    },
  ],
  allowedTargetRepos: ["https://github.com/o/r"],
};

const issue: LinearIssueSnapshot = {
  id: "issue-1",
  identifier: "WES-1",
  title: "Test",
  description: "",
  status: "Merged to Dev",
  projectName: "Example Target App",
  teamName: null,
  teamKey: null,
  teamId: "team-1",
  url: null,
};

describe("production sync idempotency", () => {
  it("skips when issue is already Merged / Deployed", () => {
    const result = checkProductionSyncIdempotency(
      config,
      { ...issue, status: "Merged / Deployed" },
      [],
      "abc123",
      "Merged / Deployed",
      "Merged to Dev",
    );
    expect(result.skip).toBe(true);
  });

  it("skips when production sync marker exists for merge commit", () => {
    const result = checkProductionSyncIdempotency(
      config,
      issue,
      [
        {
          id: "c1",
          body: `---\nharness-orchestrator-v1\nphase: production_sync\nrun_id: sync-1\nmerge_commit_sha: abc123\n---`,
        },
      ],
      "abc123",
      "Merged / Deployed",
      "Merged to Dev",
    );
    expect(result.skip).toBe(true);
  });

  it("allows sync when issue is Merged to Dev without marker", () => {
    const result = checkProductionSyncIdempotency(
      config,
      issue,
      [],
      "abc123",
      "Merged / Deployed",
      "Merged to Dev",
    );
    expect(result.skip).toBe(false);
  });
});
