import { describe, expect, it } from "vitest";
import {
  buildBaselineRules,
  createLiveBaselineDraft,
  resolveExecutorForStatus,
} from "../../src/operations/baseline-workflow.js";
import {
  buildCurrentWorkflowMappings,
  enrichStatusRecords,
} from "../../src/operations/current-workflow.js";

describe("baseline workflow", () => {
  const customConfig = {
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
    linear: {
      eligibleStatuses: {
        planning: ["Custom Planning Gate"],
        implementation: ["Custom Build Gate"],
        handoff: ["Custom PR Gate"],
        revision: ["Custom Revision Gate"],
        merge: ["Custom Merge Gate"],
      },
      transitionalStatuses: {
        pmReview: "Custom PM Gate",
        needsRevision: "Custom Revision Gate",
        readyToMerge: "Custom Merge Gate",
        blocked: "Custom Blocked",
        mergedToDev: "Custom Merged Dev",
        prOpen: "Custom PR Gate",
      },
    },
  };

  const statuses = [
    { id: "s-plan", name: "Custom Planning Gate", type: "unstarted" },
    { id: "s-build", name: "Custom Build Gate", type: "unstarted" },
    { id: "s-pr", name: "Custom PR Gate", type: "started" },
    { id: "s-pm", name: "Custom PM Gate", type: "started" },
    { id: "s-rev", name: "Custom Revision Gate", type: "unstarted" },
    { id: "s-merge", name: "Custom Merge Gate", type: "started" },
    { id: "s-blocked", name: "Custom Blocked", type: "started" },
    { id: "s-merged", name: "Custom Merged Dev", type: "completed" },
  ];

  it("assigns executors from mapping keys for custom configured status names", () => {
    const mappings = buildCurrentWorkflowMappings({
      config: customConfig,
      statuses,
      source: "fixture",
    });
    const records = enrichStatusRecords({
      config: customConfig,
      statuses,
      source: "fixture",
    });
    const planning = records.find((status) => status.id === "s-plan");
    expect(planning?.currentMappingKeys).toContain("planning");
    expect(resolveExecutorForStatus(planning!)).toBe("planner-agent");

    const baselineWarnings: Parameters<typeof buildBaselineRules>[0]["baselineWarnings"] = [];
    const rules = buildBaselineRules({
      statuses: records,
      mappings,
      baselineWarnings,
    });
    expect(rules.find((rule) => rule.id === "rule-live-planning")?.executorId).toBe(
      "planner-agent",
    );
    expect(rules.every((rule) => rule.enabled && rule.outcomes.some((o) => o.enabled))).toBe(true);
    expect(baselineWarnings).toHaveLength(0);
  });

  it("emits unresolved warnings instead of zero-outcome rules when mappings are missing", () => {
    const mappings = buildCurrentWorkflowMappings({
      config: customConfig,
      statuses: statuses.filter((status) => status.id !== "s-blocked"),
      source: "fixture",
    });
    const records = enrichStatusRecords({
      config: customConfig,
      statuses: statuses.filter((status) => status.id !== "s-blocked"),
      source: "fixture",
    });
    const baselineWarnings: Parameters<typeof buildBaselineRules>[0]["baselineWarnings"] = [];
    const rules = buildBaselineRules({
      statuses: records,
      mappings,
      baselineWarnings,
    });
    expect(rules.every((rule) => rule.outcomes.length > 0)).toBe(true);
    expect(baselineWarnings.some((w) => w.id === "unresolved-baseline-transition")).toBe(true);
  });

  it("creates live baseline draft with semantic rule ids", () => {
    const mappings = buildCurrentWorkflowMappings({
      config: customConfig,
      statuses,
      source: "fixture",
    });
    const records = enrichStatusRecords({
      config: customConfig,
      statuses,
      source: "fixture",
    });
    const draft = createLiveBaselineDraft({
      context: { mode: "live", fixturesEnabled: false },
      baseSnapshot: {
        configFingerprint: "x",
        statusCatalogFingerprint: "y",
        modelCatalogFingerprint: "z",
        workflowFingerprint: "w",
      },
      statuses: records,
      mappings,
      savedByRuntime: "source-gui",
    });
    expect(draft.rules.some((rule) => rule.id.startsWith("rule-live-"))).toBe(true);
  });
});
