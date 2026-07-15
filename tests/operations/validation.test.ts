import { describe, expect, it } from "vitest";
import { validateOperationsDraft } from "../../src/operations/validation.js";
import { getExecutorCatalog } from "../../src/operations/executor-catalog.js";

describe("operations validation", () => {
  const baseDraft = {
    schemaVersion: 1 as const,
    draftId: "draft-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    savedByRuntime: "source-gui" as const,
    sourceMode: "live" as const,
    baseSnapshot: {
      configFingerprint: "abc",
      statusCatalogFingerprint: "def",
      modelCatalogFingerprint: "ghi",
      workflowFingerprint: "jkl",
    },
    statusIdsOnCanvas: ["status-a", "status-b"],
    layout: { statusPositions: {} },
  };
  const statuses = ["status-a", "status-b", "status-c"].map((id) => ({
    id,
    name: id,
    category: "started",
    source: "fixture" as const,
    participatesInCurrentHarnessWorkflow: true,
    automationTriggerStatus: false,
    currentMappingKeys: [],
    mappingState: "resolved" as const,
  }));

  function validateRules(rules: Array<{
    id: string;
    sourceStatusId: string;
    enabled: boolean;
    executorId: string;
    outcomes: Array<{
      id: string;
      label: string;
      destinationStatusId?: string;
      enabled: boolean;
    }>;
  }>) {
    return validateOperationsDraft({
      draft: {
        ...baseDraft,
        statusIdsOnCanvas: ["status-a", "status-b", "status-c"],
        rules,
      },
      statuses,
      executors: getExecutorCatalog(),
      modelCatalog: [],
      currentWorkflowMappings: [],
    });
  }

  it("rejects non-assignable executors", () => {
    const result = validateOperationsDraft({
      draft: {
        ...baseDraft,
        rules: [
          {
            id: "rule-1",
            sourceStatusId: "status-a",
            enabled: true,
            executorId: "integration-repair",
            outcomes: [
              {
                id: "outcome-1",
                label: "Repair",
                destinationStatusId: "status-b",
                enabled: true,
              },
            ],
          },
        ],
      },
      statuses: [
        {
          id: "status-a",
          name: "Ready to Merge",
          category: "started",
          source: "fixture",
          participatesInCurrentHarnessWorkflow: true,
          automationTriggerStatus: true,
          currentMappingKeys: [],
          mappingState: "resolved",
        },
        {
          id: "status-b",
          name: "Merging",
          category: "started",
          source: "fixture",
          participatesInCurrentHarnessWorkflow: true,
          automationTriggerStatus: false,
          currentMappingKeys: [],
          mappingState: "resolved",
        },
      ],
      executors: getExecutorCatalog(),
      modelCatalog: [],
      currentWorkflowMappings: [],
    });
    expect(result.errors.some((issue) => issue.id === "non-assignable-executor")).toBe(
      true,
    );
  });

  it("warns on stale base snapshot fingerprints", () => {
    const result = validateOperationsDraft({
      draft: {
        ...baseDraft,
        rules: [],
        baseSnapshot: {
          ...baseDraft.baseSnapshot,
          configFingerprint: "stale",
        },
      },
      statuses: [],
      executors: getExecutorCatalog(),
      modelCatalog: [],
      currentWorkflowMappings: [],
      baseSnapshot: baseDraft.baseSnapshot,
    });
    expect(
      result.warnings.some((issue) => issue.id === "stale-config-fingerprint"),
    ).toBe(true);
  });

  it("does not warn for a normal linear workflow with one entry", () => {
    const result = validateRules([
      {
        id: "rule-a",
        sourceStatusId: "status-a",
        enabled: true,
        executorId: "human-decision",
        outcomes: [
          {
            id: "outcome-a",
            label: "Next",
            destinationStatusId: "status-b",
            enabled: true,
          },
        ],
      },
      {
        id: "rule-b",
        sourceStatusId: "status-b",
        enabled: true,
        executorId: "human-decision",
        outcomes: [
          {
            id: "outcome-b",
            label: "Next",
            destinationStatusId: "status-c",
            enabled: true,
          },
        ],
      },
    ]);
    expect(result.warnings.some((issue) => issue.id === "graph-has-no-entry-status")).toBe(false);
    expect(result.warnings.some((issue) => issue.id === "unreachable-status")).toBe(false);
  });

  it("does not warn for a branching workflow with one entry", () => {
    const result = validateRules([
      {
        id: "rule-a",
        sourceStatusId: "status-a",
        enabled: true,
        executorId: "human-decision",
        outcomes: [
          {
            id: "outcome-b",
            label: "B",
            destinationStatusId: "status-b",
            enabled: true,
          },
          {
            id: "outcome-c",
            label: "C",
            destinationStatusId: "status-c",
            enabled: true,
          },
        ],
      },
    ]);
    expect(result.warnings.some((issue) => issue.id === "graph-has-no-entry-status")).toBe(false);
    expect(result.warnings.some((issue) => issue.id === "unreachable-status")).toBe(false);
  });

  it("warns for a completely cyclic graph with no entry", () => {
    const result = validateRules([
      {
        id: "rule-a",
        sourceStatusId: "status-a",
        enabled: true,
        executorId: "human-decision",
        outcomes: [
          {
            id: "outcome-a",
            label: "B",
            destinationStatusId: "status-b",
            enabled: true,
          },
        ],
      },
      {
        id: "rule-b",
        sourceStatusId: "status-b",
        enabled: true,
        executorId: "human-decision",
        outcomes: [
          {
            id: "outcome-b",
            label: "C",
            destinationStatusId: "status-c",
            enabled: true,
          },
        ],
      },
      {
        id: "rule-c",
        sourceStatusId: "status-c",
        enabled: true,
        executorId: "revision-agent",
        outcomes: [
          {
            id: "outcome-c",
            label: "A",
            destinationStatusId: "status-a",
            enabled: true,
          },
        ],
      },
    ]);
    expect(result.warnings.some((issue) => issue.id === "graph-has-no-entry-status")).toBe(true);
  });

  it("warns for unreachable statuses and ignores disabled outcomes as paths", () => {
    const result = validateRules([
      {
        id: "rule-a",
        sourceStatusId: "status-a",
        enabled: true,
        executorId: "human-decision",
        outcomes: [
          {
            id: "outcome-a",
            label: "Disabled",
            destinationStatusId: "status-b",
            enabled: false,
          },
        ],
      },
      {
        id: "rule-b",
        sourceStatusId: "status-b",
        enabled: true,
        executorId: "human-decision",
        outcomes: [
          {
            id: "outcome-b",
            label: "C",
            destinationStatusId: "status-c",
            enabled: true,
          },
        ],
      },
      {
        id: "rule-c",
        sourceStatusId: "status-c",
        enabled: true,
        executorId: "revision-agent",
        outcomes: [
          {
            id: "outcome-c",
            label: "B",
            destinationStatusId: "status-b",
            enabled: true,
          },
        ],
      },
    ]);
    expect(result.warnings.some((issue) => issue.id === "unreachable-status")).toBe(true);
  });

  it("allows legitimate revision self-loops", () => {
    const result = validateRules([
      {
        id: "rule-a",
        sourceStatusId: "status-a",
        enabled: true,
        executorId: "revision-agent",
        outcomes: [
          {
            id: "outcome-a",
            label: "Retry",
            destinationStatusId: "status-a",
            enabled: true,
          },
        ],
      },
    ]);
    expect(result.errors.some((issue) => issue.id === "invalid-self-loop")).toBe(false);
  });
});
