import { describe, expect, it } from "vitest";
import { reconcileSourceModel } from "../../src/evaluation/cursor-usage-import/model-reconciliation.js";
import {
  normalizeModelRaw,
  resolveCanonicalModelId,
} from "../../src/evaluation/cursor-usage-import/model-aliases.js";
import type { ObservedModelEvidence } from "../../src/evaluation/cursor-usage-import/types.js";

function observed(
  rawModel: string,
  canonicalModelId: string | null = resolveCanonicalModelId(rawModel),
): ObservedModelEvidence {
  return {
    rawModel,
    normalizedRawModel: normalizeModelRaw(rawModel),
    canonicalModelId,
    variant: "standard",
    observationIds: [`obs-${normalizeModelRaw(rawModel)}`],
  };
}

describe("cursor usage model reconciliation", () => {
  it("allows tokens only for equal normalized unknown raw models", () => {
    const result = reconcileSourceModel({
      sourceModelRaw: "custom-unknown-a",
      sourceModelCanonical: null,
      observedModels: [observed("custom-unknown-a", null)],
      multiModelExecutionProven: false,
      candidateVariant: "standard",
    });
    expect(result.outcome).toBe("source_model_unknown");
    expect(result.tokensAllowed).toBe(true);
    expect(result.costAllowed).toBe(false);
  });

  it("conflicts when two different unknown raw models are observed", () => {
    const result = reconcileSourceModel({
      sourceModelRaw: "custom-unknown-a",
      sourceModelCanonical: null,
      observedModels: [
        observed("custom-unknown-a", null),
        observed("custom-unknown-b", null),
      ],
      multiModelExecutionProven: false,
      candidateVariant: "standard",
    });
    expect(result.outcome).toBe("model_identity_conflict");
    expect(result.reason).toBe("conflicting_unknown_raw_models");
    expect(result.tokensAllowed).toBe(false);
    expect(result.costAllowed).toBe(false);
  });

  it("blocks canonical source against unknown raw unless alias resolves", () => {
    const blocked = reconcileSourceModel({
      sourceModelRaw: "composer-2.5",
      sourceModelCanonical: "composer-2.5",
      observedModels: [observed("totally-unknown-raw", null)],
      multiModelExecutionProven: false,
      candidateVariant: "standard",
    });
    expect(blocked.outcome).toBe("model_identity_conflict");
    expect(blocked.tokensAllowed).toBe(false);

    const resolved = reconcileSourceModel({
      sourceModelRaw: "composer-2.5",
      sourceModelCanonical: "composer-2.5",
      observedModels: [observed("composer-2", resolveCanonicalModelId("composer-2"))],
      multiModelExecutionProven: false,
      candidateVariant: "standard",
    });
    expect(resolved.outcome).toBe("compatible");
    expect(resolved.tokensAllowed).toBe(true);
    expect(resolved.costAllowed).toBe(true);
  });

  it("is compatible when multiple observations agree on one model", () => {
    const model = observed("composer-2.5");
    const result = reconcileSourceModel({
      sourceModelRaw: "composer-2.5",
      sourceModelCanonical: "composer-2.5",
      observedModels: [model, { ...model, observationIds: ["obs-2"] }],
      multiModelExecutionProven: false,
      candidateVariant: "standard",
    });
    expect(result.outcome).toBe("compatible");
    expect(result.tokensAllowed).toBe(true);
    expect(result.costAllowed).toBe(true);
  });

  it("conflicts when observations contradict without multiModelExecutionProven", () => {
    const result = reconcileSourceModel({
      sourceModelRaw: "composer-2.5",
      sourceModelCanonical: "composer-2.5",
      observedModels: [
        {
          rawModel: "model-a",
          normalizedRawModel: "model-a",
          canonicalModelId: "fake-model-a",
          variant: "standard",
          observationIds: ["obs-a"],
        },
        {
          rawModel: "model-b",
          normalizedRawModel: "model-b",
          canonicalModelId: "fake-model-b",
          variant: "standard",
          observationIds: ["obs-b"],
        },
      ],
      multiModelExecutionProven: false,
      candidateVariant: "standard",
    });
    expect(result.outcome).toBe("model_identity_conflict");
    expect(result.reason).toBe("unproven_multi_model_observations");
    expect(result.tokensAllowed).toBe(false);
    expect(result.costAllowed).toBe(false);
  });
});
