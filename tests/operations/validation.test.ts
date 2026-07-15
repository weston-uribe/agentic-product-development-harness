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
});
