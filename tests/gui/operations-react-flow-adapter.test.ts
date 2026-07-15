import { describe, expect, it } from "vitest";
import {
  addStatusToCanvas,
  connectOutcome,
  domainDraftToFlow,
  updateLayoutPosition,
} from "../../apps/gui/lib/operations/reducer.ts";

describe("operations react flow adapter", () => {
  const draft = {
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
    statusIdsOnCanvas: ["status-a"],
    rules: [],
    layout: { statusPositions: { "status-a": { x: 0, y: 0 } } },
  };

  const statuses = [
    {
      id: "status-a",
      name: "Ready for Build",
      category: "unstarted",
      source: "fixture" as const,
      participatesInCurrentHarnessWorkflow: true,
      automationTriggerStatus: true,
      currentMappingKeys: ["implementation"],
      mappingState: "resolved" as const,
    },
    {
      id: "status-b",
      name: "Building",
      category: "started",
      source: "fixture" as const,
      participatesInCurrentHarnessWorkflow: true,
      automationTriggerStatus: false,
      currentMappingKeys: [],
      mappingState: "resolved" as const,
    },
  ];

  it("maps statuses to nodes and outcomes to edges with stable ids", () => {
    const withConnection = connectOutcome(draft, {
      source: "status:status-a",
      target: "status:status-b",
      sourceHandle: null,
      targetHandle: null,
    });
    const withTarget = addStatusToCanvas(withConnection, "status-b");
    const flow = domainDraftToFlow({ draft: withTarget, statuses });
    expect(flow.nodes.some((node) => node.id === "status:status-a")).toBe(true);
    expect(flow.edges[0]?.target).toBe("status:status-b");
  });

  it("updates layout positions without changing rule semantics", () => {
    const next = updateLayoutPosition(draft, "status-a", { x: 120, y: 80 });
    expect(next.layout.statusPositions["status-a"]).toEqual({ x: 120, y: 80 });
    expect(next.rules).toEqual(draft.rules);
  });
});
