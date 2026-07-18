import { describe, expect, it } from "vitest";
import {
  buildUsageRecord,
  costProjectionFields,
  resolveCostRecord,
} from "../../src/evaluation/telemetry/cost.js";

describe("cost records", () => {
  it("requires costUnavailableReason when unavailable", () => {
    const cost = resolveCostRecord({
      modelId: "composer-2.5",
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(cost.costSource).toBe("unavailable");
    expect(cost.costUnavailableReason).toBe("missing_pricing_entry");
    const fields = costProjectionFields(cost);
    expect(fields.costUnavailableReason).toBe("missing_pricing_entry");
  });

  it("uses provider cost when present", () => {
    const cost = resolveCostRecord({
      modelId: "composer-2.5",
      providerReportedCostUsd: 0.12,
      inputTokens: 10,
    });
    expect(cost.costSource).toBe("provider");
    expect(cost.providerReportedCostUsd).toBe(0.12);
    expect(cost.costUnavailableReason).toBeUndefined();
  });

  it("buildUsageRecord attaches full cost projection fields", () => {
    const usage = buildUsageRecord(
      { inputTokens: 1, outputTokens: 2 },
      "composer-2.5",
    );
    expect(usage?.cost.costSource).toBe("unavailable");
    expect(usage?.cost.costUnavailableReason).toBe("missing_pricing_entry");
  });
});
