import { describe, expect, it } from "vitest";
import {
  applyEdgeChangesToDraft,
  connectOutcome,
  domainDraftToFlow,
  mergeViewport,
  updateLayoutPosition,
} from "../../apps/gui/lib/operations/reducer.ts";
import { CANONICAL_STATUSES, CANONICAL_WORKFLOW_FINGERPRINT } from "../../src/workflow/canonical-product-development-workflow.js";
import type { OperationsBootstrapPayload, OperationsWorkflowDraft } from "../../src/operations/types.js";

describe("operations react flow adapter", () => {
  const draft: OperationsWorkflowDraft = {
    schemaVersion: 2,
    draftId: "draft-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    savedByRuntime: "source-gui",
    sourceMode: "live",
    baseSnapshot: {
      configFingerprint: "abc",
      statusCatalogFingerprint: "def",
      modelCatalogFingerprint: "ghi",
      workflowFingerprint: CANONICAL_WORKFLOW_FINGERPRINT,
    },
    layout: {
      statusPositions: {
        planning: { x: 0, y: 0 },
        building: { x: 200, y: 0 },
      },
    },
    phaseModelSettings: {},
  };

  const bootstrap: OperationsBootstrapPayload = {
    sourceMode: "live",
    selectedScopeId: "target-app",
    scopes: [{ id: "target-app", targetRepo: "owner/example-target-app", baseBranch: "main", productionBranch: "main" }],
    dataSourceLabel: "Draft workflow",
    statuses: [
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
    ],
    currentWorkflowMappings: [],
    currentModel: {
      providerId: "cursor",
      resolvedModelId: "composer-2.5",
      source: "code-default",
      pinnedParams: [],
      policyNote: "policy",
      draftOnlyNote: "draft only",
    },
    modelCatalog: [],
    catalogLoadMetadata: {
      statusCatalog: "loaded",
      modelCatalog: "loaded",
    },
    draft,
    validation: { errors: [], warnings: [], infos: [] },
    canonicalWorkflow: {
      healthState: "healthy",
      violations: [],
      informationalWarnings: [],
      resolvedStatusIds: {
        planning: "status-planning",
        building: "status-building",
      },
      mergePathVariant: "direct-production",
    },
    warnings: [],
  };

  it("maps canonical statuses to nodes and transitions to read-only edges", () => {
    const flow = domainDraftToFlow({ draft, bootstrap });
    expect(flow.nodes.some((node) => node.id === "status:planning")).toBe(true);
    expect(flow.nodes.some((node) => node.id === "status:building")).toBe(true);
    expect(flow.edges.length).toBeGreaterThan(0);
    expect(flow.edges.every((edge) => edge.data?.readOnly === true)).toBe(true);
  });

  it("updates layout positions keyed by canonical status keys", () => {
    const next = updateLayoutPosition(draft, "planning", { x: 120, y: 80 });
    expect(next.layout.statusPositions.planning).toEqual({ x: 120, y: 80 });
    expect(next.phaseModelSettings).toEqual(draft.phaseModelSettings);
  });

  it("persists viewport in layout without changing phase model settings", () => {
    const next = {
      ...draft,
      layout: mergeViewport(draft.layout, { x: 10, y: 20, zoom: 0.75 }),
    };
    expect(next.layout.viewport).toEqual({ x: 10, y: 20, zoom: 0.75 });
    expect(next.phaseModelSettings).toEqual(draft.phaseModelSettings);
  });

  it("treats canonical transitions as read-only in draft mutations", () => {
    const connected = connectOutcome(draft, {
      source: "status:planning",
      target: "status:building",
      sourceHandle: null,
      targetHandle: null,
    });
    expect(connected).toEqual(draft);

    const deleted = applyEdgeChangesToDraft(draft, [
      { id: "edge:planning:building:success", type: "remove" },
    ]);
    expect(deleted).toEqual(draft);
  });

  it("renders all canonical statuses regardless of draft layout completeness", () => {
    const flow = domainDraftToFlow({ draft, bootstrap });
    expect(flow.nodes).toHaveLength(CANONICAL_STATUSES.length);
  });
});
