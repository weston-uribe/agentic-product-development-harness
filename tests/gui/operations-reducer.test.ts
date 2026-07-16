import { describe, expect, it } from "vitest";
import {
  OPERATIONS_HISTORY_LIMIT,
  buildDefaultModelSelection,
  createInitialOperationsState,
  fingerprintOperationsDraft,
  isDraftDirty,
  operationsReducer,
  updatePhaseModelSelection,
  updatePhaseModelParameter,
} from "../../apps/gui/lib/operations/reducer.ts";
import type {
  OperationsBootstrapPayload,
  OperationsWorkflowDraft,
} from "../../src/operations/types.js";
import { CANONICAL_WORKFLOW_FINGERPRINT } from "../../src/workflow/canonical-product-development-workflow.js";

function draft(overrides: Partial<OperationsWorkflowDraft> = {}): OperationsWorkflowDraft {
  return {
    schemaVersion: 2,
    draftId: "draft-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    savedByRuntime: "source-gui",
    sourceMode: "live",
    baseSnapshot: {
      configFingerprint: "config",
      statusCatalogFingerprint: "statuses",
      modelCatalogFingerprint: "models",
      workflowFingerprint: CANONICAL_WORKFLOW_FINGERPRINT,
    },
    layout: { statusPositions: { planning: { x: 0, y: 0 } } },
    phaseModelSettings: {
      implementation: {
        modelId: "composer-2.5",
        displayNameAtSelection: "Composer 2.5",
        parameters: [{ id: "fast", value: "false" }],
      },
    },
    ...overrides,
  };
}

function bootstrap(initialDraft = draft()): OperationsBootstrapPayload {
  return {
    sourceMode: "live",
    selectedScopeId: "target-app",
    scopes: [{ id: "target-app", targetRepo: "owner/example-target-app" }],
    dataSourceLabel: "Draft workflow",
    statuses: [],
    currentWorkflowMappings: [],
    currentModel: {
      providerId: "cursor",
      resolvedModelId: "composer-2.5",
      source: "code-default",
      pinnedParams: [{ id: "fast", value: "false" }],
      policyNote: "policy",
      draftOnlyNote: "draft only",
    },
    modelCatalog: [
      {
        id: "composer-2.5",
        displayName: "Composer 2.5",
        availability: "available",
        source: "fixture",
        supportedParameters: [
          {
            id: "fast",
            label: "Fast",
            type: "boolean",
            allowedValues: ["true", "false"],
            defaultValue: "true",
          },
        ],
      },
    ],
    catalogLoadMetadata: {
      statusCatalog: "loaded",
      modelCatalog: "loaded",
    },
    draft: initialDraft,
    validation: { errors: [], warnings: [], infos: [] },
    canonicalWorkflow: {
      healthState: "healthy",
      violations: [],
      resolvedStatusIds: {},
      mergePathVariant: "direct-production",
    },
    warnings: [],
  };
}

describe("operations reducer", () => {
  it("tracks edit, save start, save success, and edit after save", () => {
    let state = createInitialOperationsState(bootstrap());
    const edited = draft({
      phaseModelSettings: {
        planning: {
          modelId: "composer-2.5",
          displayNameAtSelection: "Composer 2.5",
          parameters: [],
        },
      },
    });
    state = operationsReducer(state, { type: "commit-draft", draft: edited });
    expect(isDraftDirty(state.draft, state.cleanFingerprint)).toBe(true);

    const token = state.nextRequestToken;
    state = operationsReducer(state, { type: "save-start" });
    expect(state.requestState).toBe("saving");
    expect(state.activeRequest?.token).toBe(token);

    const saved = { ...edited, updatedAt: "2026-01-01T00:00:01.000Z" };
    state = operationsReducer(state, {
      type: "save-success",
      token,
      draft: saved,
      message: "Saved",
    });
    expect(state.requestState).toBe("saved");
    expect(state.saveMessage).toBe("Saved");
    expect(fingerprintOperationsDraft(state.cleanDraft)).toBe(
      fingerprintOperationsDraft(saved),
    );
    expect(isDraftDirty(state.draft, state.cleanFingerprint)).toBe(false);

    state = operationsReducer(state, {
      type: "commit-draft",
      draft: draft({
        layout: { statusPositions: { planning: { x: 100, y: 100 } } },
      }),
    });
    expect(isDraftDirty(state.draft, state.cleanFingerprint)).toBe(true);
  });

  it("preserves the draft on save failure and keeps fingerprint-derived dirty state", () => {
    let state = createInitialOperationsState(bootstrap());
    const edited = draft({
      phaseModelSettings: {
        planning: {
          modelId: "composer-2.5",
          displayNameAtSelection: "Composer 2.5",
          parameters: [],
        },
      },
    });
    state = operationsReducer(state, { type: "commit-draft", draft: edited });
    const token = state.nextRequestToken;
    state = operationsReducer(state, { type: "save-start" });
    state = operationsReducer(state, {
      type: "save-error",
      token,
      message: "Failed",
    });
    expect(state.requestState).toBe("error");
    expect(state.draft.phaseModelSettings.planning?.modelId).toBe("composer-2.5");
    expect(isDraftDirty(state.draft, state.cleanFingerprint)).toBe(true);
  });

  it("isDraftDirty is false when draft matches clean baseline", () => {
    const state = createInitialOperationsState(bootstrap());
    expect(isDraftDirty(state.draft, state.cleanFingerprint)).toBe(false);
  });

  it("blocks commit-draft while a request is active", () => {
    let state = createInitialOperationsState(bootstrap());
    state = operationsReducer(state, {
      type: "commit-draft",
      draft: draft({
        phaseModelSettings: {
          planning: {
            modelId: "composer-2.5",
            displayNameAtSelection: "Composer 2.5",
            parameters: [],
          },
        },
      }),
    });
    state = operationsReducer(state, { type: "save-start" });
    const before = state.draft;
    state = operationsReducer(state, {
      type: "commit-draft",
      draft: draft({
        layout: { statusPositions: { building: { x: 50, y: 50 } } },
      }),
    });
    expect(state.draft).toBe(before);
  });

  it("undo back to the saved baseline is not dirty", () => {
    let state = createInitialOperationsState(bootstrap());
    const edited = draft({
      phaseModelSettings: {
        planning: {
          modelId: "composer-2.5",
          displayNameAtSelection: "Composer 2.5",
          parameters: [],
        },
      },
    });
    state = operationsReducer(state, { type: "commit-draft", draft: edited });
    state = operationsReducer(state, { type: "undo" });
    expect(isDraftDirty(state.draft, state.cleanFingerprint)).toBe(false);
  });

  it("reset error on clean draft is not fingerprint-dirty", () => {
    let state = createInitialOperationsState(bootstrap());
    const token = state.nextRequestToken;
    state = operationsReducer(state, { type: "reset-start" });
    state = operationsReducer(state, {
      type: "reset-error",
      token,
      message: "Reset failed",
    });
    expect(state.requestState).toBe("error");
    expect(isDraftDirty(state.draft, state.cleanFingerprint)).toBe(false);
  });

  it("bounds meaningful undo history", () => {
    let state = createInitialOperationsState(bootstrap());
    for (let index = 0; index < OPERATIONS_HISTORY_LIMIT + 10; index += 1) {
      state = operationsReducer(state, {
        type: "commit-draft",
        draft: draft({
          layout: { statusPositions: { planning: { x: index, y: index } } },
        }),
      });
    }
    expect(state.past).toHaveLength(OPERATIONS_HISTORY_LIMIT);
  });

  it("ignores stale save responses", () => {
    let state = createInitialOperationsState(bootstrap());
    state = operationsReducer(state, {
      type: "commit-draft",
      draft: draft({
        phaseModelSettings: {
          planning: {
            modelId: "composer-2.5",
            displayNameAtSelection: "Composer 2.5",
            parameters: [],
          },
        },
      }),
    });
    const token = state.nextRequestToken;
    state = operationsReducer(state, { type: "save-start" });
    const afterStale = operationsReducer(state, {
      type: "save-success",
      token: token + 1,
      draft: draft({ draftId: "stale" }),
    });
    expect(afterStale.draft.draftId).not.toBe("stale");
    expect(afterStale.requestState).toBe("saving");
  });

  it("initializes model parameters from catalog defaults", () => {
    const catalog = bootstrap().modelCatalog;
    const selection = buildDefaultModelSelection(catalog[0]!);
    expect(selection.parameters).toEqual([{ id: "fast", value: "true" }]);

    const next = updatePhaseModelSelection(draft(), "implementation", "composer-2.5", catalog);
    expect(next.phaseModelSettings.implementation?.parameters).toEqual([
      { id: "fast", value: "true" },
    ]);
  });

  it("updates phase model parameters", () => {
    const next = updatePhaseModelParameter(draft(), "implementation", "fast", "true");
    expect(next.phaseModelSettings.implementation?.parameters).toEqual([
      { id: "fast", value: "true" },
    ]);
  });

  it("no-ops duplicate selection updates", () => {
    let state = createInitialOperationsState(bootstrap());
    state = operationsReducer(state, {
      type: "select",
      selection: { kind: "status", canonicalStatusKey: "planning" },
    });
    const before = state;
    state = operationsReducer(state, {
      type: "select",
      selection: { kind: "status", canonicalStatusKey: "planning" },
    });
    expect(state).toBe(before);
  });
});
