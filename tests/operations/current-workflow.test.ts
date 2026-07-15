import { describe, expect, it } from "vitest";
import {
  buildCurrentWorkflowMappings,
  enrichStatusRecords,
  findDuplicateNormalizedNames,
} from "../../src/operations/current-workflow.js";

describe("current workflow normalization", () => {
  const config = {
    version: 1 as const,
    orchestratorMarker: "harness-orchestrator-v1",
    logDirectory: "runs",
    repos: [
      {
        id: "target-app",
        targetRepo: "https://github.com/owner/example-target-app",
        baseBranch: "main",
        productionBranch: "main",
      },
    ],
    allowedTargetRepos: ["https://github.com/owner/example-target-app"],
  };

  it("marks ambiguous configured mappings when multiple live statuses share a name", () => {
    const statuses = [
      { id: "a", name: "Ready for Build", type: "unstarted" },
      { id: "b", name: "ready for build", type: "unstarted" },
    ];
    const mappings = buildCurrentWorkflowMappings({
      config,
      statuses,
      source: "fixture",
    });
    const implementation = mappings.find((entry) => entry.mappingKey === "implementation");
    expect(implementation?.state).toBe("ambiguous");
    expect(implementation?.resolvedStatusIds).toHaveLength(2);
  });

  it("marks missing configured mappings when no live status matches", () => {
    const mappings = buildCurrentWorkflowMappings({
      config,
      statuses: [],
      source: "fixture",
    });
    expect(mappings.some((entry) => entry.state === "missing")).toBe(true);
  });

  it("detects duplicate normalized status names", () => {
    expect(
      findDuplicateNormalizedNames([
        { id: "1", name: "Ready for Build", type: "unstarted" },
        { id: "2", name: "ready for build", type: "unstarted" },
      ]),
    ).toEqual(["ready for build"]);
  });

  it("treats multi-role status resolution as valid when each mapping is unique", () => {
    const statuses = [
      { id: "status-pr-open", name: "PR Open", type: "started" },
      { id: "status-ready-merge", name: "Ready to Merge", type: "started" },
    ];
    const mappings = buildCurrentWorkflowMappings({
      config,
      statuses,
      source: "fixture",
    });
    const records = enrichStatusRecords({
      config,
      statuses,
      source: "fixture",
    });
    const prOpen = records.find((record) => record.id === "status-pr-open");
    expect(prOpen?.mappingState).toBe("resolved");
    expect(
      mappings.filter((mapping) => mapping.resolvedStatusIds.includes("status-pr-open")).length,
    ).toBeGreaterThan(1);
  });
});
