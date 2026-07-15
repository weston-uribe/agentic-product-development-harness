import { describe, expect, it } from "vitest";
import { getFixtureDefinition } from "../../src/operations/fixtures/index.js";
import { domainDraftToFlow } from "../../apps/gui/lib/operations/reducer.ts";

describe("operations performance fixtures", () => {
  it("generates flow nodes and edges for the 100-status fixture within reasonable limits", () => {
    const fixture = getFixtureDefinition("hundred-node-performance");
    const draft = {
      schemaVersion: 1 as const,
      draftId: "perf-draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      savedByRuntime: "fixture-test" as const,
      sourceMode: "fixture" as const,
      baseSnapshot: {
        configFingerprint: "abc",
        statusCatalogFingerprint: "def",
        modelCatalogFingerprint: "ghi",
        workflowFingerprint: "jkl",
      },
      statusIdsOnCanvas: fixture.statuses.slice(0, 100).map((status) => status.id),
      rules: fixture.statuses.slice(0, 10).map((status, index) => ({
        id: `rule-${index}`,
        sourceStatusId: status.id,
        enabled: true,
        executorId: "human-decision",
        outcomes: [
          {
            id: `outcome-${index}`,
            label: "Next",
            destinationStatusId: fixture.statuses[index + 1]?.id,
            enabled: true,
          },
        ],
      })),
      layout: {
        statusPositions: Object.fromEntries(
          fixture.statuses.map((status, index) => [
            status.id,
            { x: (index % 10) * 200, y: Math.floor(index / 10) * 120 },
          ]),
        ),
      },
    };

    const started = performance.now();
    const flow = domainDraftToFlow({
      draft,
      statuses: fixture.statuses.map((status) => ({
        id: status.id,
        name: status.name,
        category: status.type,
        source: "fixture" as const,
        participatesInCurrentHarnessWorkflow: true,
        automationTriggerStatus: false,
        currentMappingKeys: [],
        mappingState: "unmapped" as const,
      })),
    });
    const elapsed = performance.now() - started;

    expect(flow.nodes).toHaveLength(100);
    expect(flow.edges.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(250);
  });
});
