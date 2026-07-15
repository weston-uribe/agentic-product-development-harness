import { describe, expect, it } from "vitest";
import { operationsWorkflowDraftSchema } from "../../src/operations/schema.js";
import { OPERATIONS_DRAFT_SCHEMA_VERSION } from "../../src/operations/constants.js";

describe("operations schema", () => {
  it("accepts a minimal valid draft payload", () => {
    const result = operationsWorkflowDraftSchema.safeParse({
      schemaVersion: OPERATIONS_DRAFT_SCHEMA_VERSION,
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
      layout: { statusPositions: {} },
    });
    expect(result.success).toBe(true);
  });
});
