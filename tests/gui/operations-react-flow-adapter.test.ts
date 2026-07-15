import { describe, expect, it } from "vitest";
import {
  addStatusToCanvas,
  applyEdgeChangesToDraft,
  connectOutcome,
  domainDraftToFlow,
  mergeViewport,
  reconnectOutcome,
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
    const withTarget = addStatusToCanvas(draft, "status-b");
    const withConnection = connectOutcome(
      withTarget,
      {
        source: "status:status-a",
        target: "status:status-b",
        sourceHandle: null,
        targetHandle: null,
      },
      { statuses },
    );
    const flow = domainDraftToFlow({ draft: withConnection, statuses });
    expect(flow.nodes.some((node) => node.id === "status:status-a")).toBe(true);
    expect(flow.edges[0]?.target).toBe("status:status-b");
  });

  it("updates layout positions without changing rule semantics", () => {
    const next = updateLayoutPosition(draft, "status-a", { x: 120, y: 80 });
    expect(next.layout.statusPositions["status-a"]).toEqual({ x: 120, y: 80 });
    expect(next.rules).toEqual(draft.rules);
  });

  it("persists viewport in layout without changing rule semantics", () => {
    const next = {
      ...draft,
      layout: mergeViewport(draft.layout, { x: 10, y: 20, zoom: 0.75 }),
    };
    expect(next.layout.viewport).toEqual({ x: 10, y: 20, zoom: 0.75 });
    expect(next.rules).toEqual(draft.rules);
  });

  it("reconnects and deletes the same canonical outcome", () => {
    const withTarget = addStatusToCanvas(
      addStatusToCanvas(
        connectOutcome(
          addStatusToCanvas(draft, "status-b"),
          {
            source: "status:status-a",
            target: "status:status-b",
            sourceHandle: null,
            targetHandle: null,
          },
          { statuses },
        ),
        "status-c",
      ),
      "status-c",
    );
    const edge = domainDraftToFlow({ draft: withTarget, statuses }).edges[0]!;
    const reconnected = reconnectOutcome(withTarget, edge.id, "status-c");
    expect(reconnected.rules[0]?.outcomes[0]?.destinationStatusId).toBe("status-c");

    const deleted = applyEdgeChangesToDraft(reconnected, [
      { id: edge.id, type: "remove" },
    ]);
    expect(deleted.rules[0]?.outcomes).toHaveLength(0);
  });
});
