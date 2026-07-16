import { describe, expect, it } from "vitest";
import {
  CANONICAL_WORKFLOW_FINGERPRINT,
  createLiveBaselineDraft,
} from "../../src/operations/baseline-workflow.js";
import { getDefaultCanonicalLayout } from "../../src/workflow/canonical-product-development-workflow.js";

describe("baseline workflow", () => {
  it("creates a V2 live baseline draft with canonical layout and fingerprint", () => {
    const draft = createLiveBaselineDraft({
      context: { mode: "live", fixturesEnabled: false },
      baseSnapshot: {
        configFingerprint: "x",
        statusCatalogFingerprint: "y",
        modelCatalogFingerprint: "z",
        workflowFingerprint: "legacy-fingerprint",
      },
      savedByRuntime: "source-gui",
    });

    expect(draft.schemaVersion).toBe(2);
    expect(draft.baseSnapshot.workflowFingerprint).toBe(CANONICAL_WORKFLOW_FINGERPRINT);
    expect(draft.phaseModelSettings).toEqual({});
    expect(draft.layout.statusPositions).toEqual(getDefaultCanonicalLayout());
    expect(draft.layout.viewport).toEqual({ x: 0, y: 0, zoom: 0.85 });
  });

  it("preserves source mode and base snapshot fingerprints from input", () => {
    const draft = createLiveBaselineDraft({
      context: { mode: "fixture", fixturesEnabled: true, fixtureId: "basic-current-workflow" },
      baseSnapshot: {
        configFingerprint: "config",
        statusCatalogFingerprint: "statuses",
        modelCatalogFingerprint: "models",
        workflowFingerprint: "ignored",
        scopeId: "target-app",
      },
      savedByRuntime: "fixture-test",
    });

    expect(draft.sourceMode).toBe("fixture");
    expect(draft.savedByRuntime).toBe("fixture-test");
    expect(draft.baseSnapshot.configFingerprint).toBe("config");
    expect(draft.baseSnapshot.statusCatalogFingerprint).toBe("statuses");
    expect(draft.baseSnapshot.modelCatalogFingerprint).toBe("models");
    expect(draft.baseSnapshot.scopeId).toBe("target-app");
  });
});
