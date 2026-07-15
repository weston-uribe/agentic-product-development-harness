import { describe, expect, it } from "vitest";
import {
  OPERATIONS_HISTORY_LIMIT,
  buildDefaultModelSelection,
  createInitialOperationsState,
  fingerprintOperationsDraft,
  operationsReducer,
  updateRuleModelSelection,
  updateRuleWithExecutorCleanup,
} from "../../apps/gui/lib/operations/reducer.ts";
import type {
  OperationsBootstrapPayload,
  OperationsWorkflowDraft,
} from "../../src/operations/types.js";
import { getExecutorCatalog } from "../../src/operations/executor-catalog.js";

function draft(overrides: Partial<OperationsWorkflowDraft> = {}): OperationsWorkflowDraft {
  return {
    schemaVersion: 1,
    draftId: "draft-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    savedByRuntime: "source-gui",
    sourceMode: "live",
    baseSnapshot: {
      configFingerprint: "config",
      statusCatalogFingerprint: "statuses",
      modelCatalogFingerprint: "models",
      workflowFingerprint: "workflow",
    },
    statusIdsOnCanvas: ["status-a", "status-b"],
    rules: [
      {
        id: "rule-a",
        sourceStatusId: "status-a",
        enabled: true,
        executorId: "implementation-agent",
        modelSelection: {
          modelId: "composer-2.5",
          displayNameAtSelection: "Composer 2.5",
          parameters: [{ id: "fast", value: "false" }],
        },
        outcomes: [
          {
            id: "outcome-a",
            label: "Done",
            destinationStatusId: "status-b",
            enabled: true,
          },
        ],
      },
    ],
    layout: { statusPositions: {} },
    ...overrides,
  };
}

function bootstrap(initialDraft = draft()): OperationsBootstrapPayload {
  return {
    sourceMode: "live",
    dataSourceLabel: "Live workspace data",
    statuses: [],
    executors: getExecutorCatalog(),
    nestedCapabilities: [],
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
    draft: initialDraft,
    validation: { errors: [], warnings: [], infos: [] },
    warnings: [],
  };
}

describe("operations reducer", () => {
  it("tracks edit, save start, save success, and edit after save", () => {
    let state = createInitialOperationsState(bootstrap());
    const edited = draft({ statusIdsOnCanvas: ["status-a"] });
    state = operationsReducer(state, { type: "commit-draft", draft: edited });
    expect(state.saveState).toBe("dirty");

    const token = state.nextRequestToken;
    state = operationsReducer(state, { type: "save-start" });
    expect(state.saveState).toBe("saving");
    expect(state.activeRequest?.token).toBe(token);

    const saved = { ...edited, updatedAt: "2026-01-01T00:00:01.000Z" };
    state = operationsReducer(state, {
      type: "save-success",
      token,
      draft: saved,
      message: "Saved",
    });
    expect(state.saveState).toBe("saved");
    expect(state.saveMessage).toBe("Saved");
    expect(fingerprintOperationsDraft(state.cleanDraft)).toBe(
      fingerprintOperationsDraft(saved),
    );

    state = operationsReducer(state, {
      type: "commit-draft",
      draft: { ...saved, statusIdsOnCanvas: ["status-a", "status-b"] },
    });
    expect(state.saveState).toBe("dirty");
  });

  it("preserves the draft on save failure", () => {
    let state = createInitialOperationsState(bootstrap());
    const edited = draft({ statusIdsOnCanvas: ["status-a"] });
    state = operationsReducer(state, { type: "commit-draft", draft: edited });
    const token = state.nextRequestToken;
    state = operationsReducer(state, { type: "save-start" });
    state = operationsReducer(state, {
      type: "save-error",
      token,
      message: "Failed",
    });
    expect(state.saveState).toBe("error");
    expect(state.draft.statusIdsOnCanvas).toEqual(["status-a"]);
  });

  it("undo back to the saved baseline becomes clean", () => {
    let state = createInitialOperationsState(bootstrap());
    const edited = draft({ statusIdsOnCanvas: ["status-a"] });
    state = operationsReducer(state, { type: "commit-draft", draft: edited });
    state = operationsReducer(state, { type: "undo" });
    expect(state.saveState).toBe("clean");
  });

  it("bounds meaningful undo history", () => {
    let state = createInitialOperationsState(bootstrap());
    for (let index = 0; index < OPERATIONS_HISTORY_LIMIT + 10; index += 1) {
      state = operationsReducer(state, {
        type: "commit-draft",
        draft: draft({ statusIdsOnCanvas: [`status-${index}`] }),
      });
    }
    expect(state.past).toHaveLength(OPERATIONS_HISTORY_LIMIT);
  });

  it("ignores stale save responses", () => {
    let state = createInitialOperationsState(bootstrap());
    state = operationsReducer(state, {
      type: "commit-draft",
      draft: draft({ statusIdsOnCanvas: ["status-a"] }),
    });
    const token = state.nextRequestToken;
    state = operationsReducer(state, { type: "save-start" });
    const afterStale = operationsReducer(state, {
      type: "save-success",
      token: token + 1,
      draft: draft({ draftId: "stale" }),
    });
    expect(afterStale.draft.draftId).not.toBe("stale");
    expect(afterStale.saveState).toBe("saving");
  });

  it("cleans incompatible executor fields on executor switch", () => {
    const next = updateRuleWithExecutorCleanup(
      draft({
        rules: [
          {
            id: "rule-a",
            sourceStatusId: "status-a",
            enabled: true,
            executorId: "merge-runner",
            modelSelection: {
              modelId: "composer-2.5",
              displayNameAtSelection: "Composer 2.5",
              parameters: [],
            },
            nestedRecoveryPolicy: {
              deterministicRepairEnabled: true,
              cursorAgentFallbackEnabled: true,
            },
            outcomes: [],
          },
        ],
      }),
      "rule-a",
      { executorId: "human-decision" },
      getExecutorCatalog(),
    );
    expect(next.rules[0]?.modelSelection).toBeUndefined();
    expect(next.rules[0]?.nestedRecoveryPolicy).toBeUndefined();
  });

  it("initializes model parameters from catalog defaults", () => {
    const catalog = bootstrap().modelCatalog;
    const selection = buildDefaultModelSelection(catalog[0]!);
    expect(selection.parameters).toEqual([{ id: "fast", value: "true" }]);

    const next = updateRuleModelSelection(draft(), "rule-a", "composer-2.5", catalog);
    expect(next.rules[0]?.modelSelection?.parameters).toEqual([
      { id: "fast", value: "true" },
    ]);
  });
});
