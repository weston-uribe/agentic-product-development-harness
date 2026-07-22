import { describe, expect, it } from "vitest";
import { buildSegmentsFromCanonicalEvents } from "../../src/evaluation/cursor-usage-import/attribution.js";
import type { CanonicalUsageEvent } from "../../src/evaluation/cursor-usage-import/canonical.js";
import { CURSOR_USAGE_IMPORTER_VERSION } from "../../src/evaluation/cursor-usage-import/types.js";

const AGENT_ID = "bc-agent-planning-001";

function makeEvent(params: {
  fingerprint: string;
  providerActualUsdMicros: string;
}): CanonicalUsageEvent {
  return {
    sourceType: "cursor_csv",
    sourceSchemaVersion: 1,
    importerVersion: CURSOR_USAGE_IMPORTER_VERSION,
    sourceEventFingerprint: params.fingerprint,
    sourceDigestOrQueryId: "digest",
    timestampIso: "2026-07-19T12:00:00.000Z",
    cloudAgentId: AGENT_ID,
    automationId: null,
    modelRaw: "composer-2.5",
    modelIdCanonical: "composer-2.5",
    sourceMaxMode: "false",
    sourceFastHint: "unknown",
    kind: "Included",
    billingCategory: "provider_actual_usd",
    tokens: {
      inputTokens: 10,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 5,
      totalTokens: 15,
    },
    providerActualUsdMicros: params.providerActualUsdMicros,
    isTokenBased: true,
    includedInPlan: false,
    capability: "issue_phase_scores",
    warnings: [],
  };
}

describe("cursor usage provider actual micros aggregation", () => {
  it("sums providerActualUsdMicros via addMicrosStrings for same agent/model segment", () => {
    const segments = buildSegmentsFromCanonicalEvents([
      makeEvent({ fingerprint: "fp-1", providerActualUsdMicros: "10000" }),
      makeEvent({ fingerprint: "fp-2", providerActualUsdMicros: "25000" }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.providerActualUsdMicros).toBe("35000");
    expect(segments[0]!.rowCount).toBe(2);
  });

  it("sums fractional-cent style micros without last-write-wins", () => {
    const segments = buildSegmentsFromCanonicalEvents([
      makeEvent({ fingerprint: "fp-a", providerActualUsdMicros: "12345" }),
      makeEvent({ fingerprint: "fp-b", providerActualUsdMicros: "6789" }),
    ]);
    expect(segments[0]!.providerActualUsdMicros).toBe("19134");
  });
});
