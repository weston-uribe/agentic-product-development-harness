import { describe, expect, it } from "vitest";
import type { HarnessConfig } from "../../src/config/types.js";
import type { LinearIssueSnapshot } from "../../src/linear/client.js";
import {
  assertImplementationEligibleStatus,
  checkImplementationIdempotency,
  isNarrowImplementationIssue,
} from "../../src/runner/idempotency.js";

const config: HarnessConfig = {
  version: 1,
  orchestratorMarker: "harness-orchestrator-v1",
  logDirectory: "runs",
  linear: {
    eligibleStatuses: {
      implementation: ["Ready for Build"],
    },
    transitionalStatuses: {
      buildingInProgress: "Building",
      prOpen: "PR Open",
    },
  },
  repos: [],
  allowedTargetRepos: ["https://github.com/o/r"],
};

const issue: LinearIssueSnapshot = {
  id: "issue-1",
  identifier: "WES-12",
  title: "Test",
  description: "",
  status: "Ready for Build",
  projectName: null,
  teamName: null,
  teamId: "team-1",
  url: null,
};

describe("implementation idempotency", () => {
  it("skips when issue is already PR Open", async () => {
    const result = await checkImplementationIdempotency(
      config,
      { ...issue, status: "PR Open" },
      [],
      false,
    );

    expect(result.skip).toBe(true);
    expect(result.reason).toContain("duplicate_phase_completed");
  });

  it("bypasses duplicate checks with force", async () => {
    const result = await checkImplementationIdempotency(
      config,
      { ...issue, status: "PR Open" },
      [],
      true,
    );

    expect(result.skip).toBe(false);
  });

  it("rejects wrong implementation status", () => {
    expect(() =>
      assertImplementationEligibleStatus(
        config,
        { ...issue, status: "Backlog" },
        false,
      ),
    ).toThrow(/wrong_status/);
  });

  it("allows Building status when force is set", () => {
    expect(() =>
      assertImplementationEligibleStatus(
        config,
        { ...issue, status: "Building" },
        true,
      ),
    ).not.toThrow();
  });

  it("identifies narrow implementation issues", () => {
    expect(
      isNarrowImplementationIssue({
        task: "Add a temporary hello world page.",
        acceptanceCriteria: ["Page exists", "PR opens"],
        outOfScope: [],
        parseErrors: [],
      }),
    ).toBe(true);
  });
});
