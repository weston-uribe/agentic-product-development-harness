import { describe, expect, it } from "vitest";
import {
  createCanonicalBaselineDraft,
  migrateV1DraftToV2,
  parseAndMigrateOperationsDraft,
} from "../../src/operations/draft-migration.js";
import { CANONICAL_WORKFLOW_FINGERPRINT } from "../../src/workflow/canonical-product-development-workflow.js";
import type { OperationsStatusRecord, OperationsWorkflowDraftV1 } from "../../src/operations/types.js";

describe("operations draft migration", () => {
  const statuses: OperationsStatusRecord[] = [
    {
      id: "status-planning",
      name: "Planning",
      category: "started",
      source: "fixture",
      participatesInCurrentHarnessWorkflow: true,
      automationTriggerStatus: false,
      currentMappingKeys: [],
      mappingState: "resolved",
      canonicalStatusKey: "planning",
    },
    {
      id: "status-building",
      name: "Building",
      category: "started",
      source: "fixture",
      participatesInCurrentHarnessWorkflow: true,
      automationTriggerStatus: false,
      currentMappingKeys: [],
      mappingState: "resolved",
      canonicalStatusKey: "building",
    },
  ];

  const v1Draft: OperationsWorkflowDraftV1 = {
    schemaVersion: 1,
    draftId: "legacy-draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    savedByRuntime: "source-gui",
    sourceMode: "live",
    baseSnapshot: {
      configFingerprint: "abc",
      statusCatalogFingerprint: "def",
      modelCatalogFingerprint: "ghi",
      workflowFingerprint: "legacy",
    },
    statusIdsOnCanvas: ["status-planning", "status-building"],
    rules: [
      {
        id: "rule-planning",
        sourceStatusId: "status-planning",
        enabled: true,
        executorId: "planner-agent",
        modelSelection: {
          modelId: "composer-2.5",
          displayNameAtSelection: "Composer 2.5",
          parameters: [{ id: "fast", value: "false" }],
        },
        outcomes: [
          {
            id: "outcome-1",
            label: "Done",
            destinationStatusId: "status-building",
            enabled: true,
          },
        ],
      },
    ],
    layout: {
      statusPositions: {
        "status-planning": { x: 100, y: 200 },
        "status-building": { x: 300, y: 200 },
      },
    },
  };

  it("migrates V1 layout positions to canonical status keys", () => {
    const migrated = migrateV1DraftToV2({ v1: v1Draft, statuses });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.layout.statusPositions.planning).toEqual({ x: 100, y: 200 });
    expect(migrated.layout.statusPositions.building).toEqual({ x: 300, y: 200 });
    expect(migrated.baseSnapshot.workflowFingerprint).toBe(CANONICAL_WORKFLOW_FINGERPRINT);
  });

  it("preserves recognized phase model selections and discards prototype rules", () => {
    const migrated = migrateV1DraftToV2({ v1: v1Draft, statuses });
    expect(migrated.phaseModelSettings.planning?.modelId).toBe("composer-2.5");
    expect(migrated.metadata?.migratedFromV1).toBe(true);
    expect(migrated.metadata?.migrationNotice).toContain("Prototype workflow rules were discarded");
  });

  it("parseAndMigrateOperationsDraft returns migrated true for V1 payloads", () => {
    const result = parseAndMigrateOperationsDraft({ raw: v1Draft, statuses });
    expect(result.migrated).toBe(true);
    expect(result.draft?.schemaVersion).toBe(2);
  });

  it("parseAndMigrateOperationsDraft returns migrated false for V2 payloads", () => {
    const v2 = createCanonicalBaselineDraft({
      baseSnapshot: v1Draft.baseSnapshot,
      sourceMode: "live",
      savedByRuntime: "source-gui",
    });
    const result = parseAndMigrateOperationsDraft({ raw: v2, statuses });
    expect(result.migrated).toBe(false);
    expect(result.draft?.draftId).toBe(v2.draftId);
  });
});
