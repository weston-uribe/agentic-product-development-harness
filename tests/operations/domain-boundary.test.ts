import { describe, expect, it } from "vitest";
import type { OperationsWorkflowDraft } from "../../src/operations/types.js";

describe("operations domain boundary", () => {
  it("does not use React Flow node or edge shapes in canonical draft types", () => {
    const draft: OperationsWorkflowDraft = {
      schemaVersion: 1,
      draftId: "draft-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      savedByRuntime: "source-gui",
      sourceMode: "live",
      baseSnapshot: {
        configFingerprint: "abc",
        statusCatalogFingerprint: "def",
        modelCatalogFingerprint: "ghi",
        workflowFingerprint: "jkl",
      },
      statusIdsOnCanvas: ["status-1"],
      rules: [],
      layout: {
        statusPositions: {
          "status-1": { x: 10, y: 20 },
        },
      },
    };

    expect(Object.keys(draft.layout.statusPositions["status-1"] ?? {})).toEqual([
      "x",
      "y",
    ]);
    expect("nodes" in draft).toBe(false);
    expect("edges" in draft).toBe(false);
  });
});
