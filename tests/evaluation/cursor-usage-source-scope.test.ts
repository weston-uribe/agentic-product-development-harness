import { describe, expect, it } from "vitest";
import { evaluateSourceScope } from "../../src/evaluation/cursor-usage-import/source-scope.js";
import type { ExportWindow, UsageSegment } from "../../src/evaluation/cursor-usage-import/canonical.js";

const exportWindow: ExportWindow = {
  startIso: "2026-07-19T10:00:00.000Z",
  endIso: "2026-07-19T14:00:00.000Z",
  timezone: "UTC",
  precision: "second",
  boundsSource: "operator_gui_fields",
};

const segment: UsageSegment = {
  cloudAgentId: "bc-agent-001",
  cloudAgentIdHash: "abc",
  modelRaw: "composer-2.5",
  modelIdCanonical: "composer-2.5",
  billingSemantic: "included_like",
  tokens: {
    inputTokens: 1,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    totalTokens: 1,
  },
  rowCount: 1,
  fingerprints: ["fp-1"],
  timestampMin: "2026-07-19T11:00:00.000Z",
  timestampMax: "2026-07-19T11:30:00.000Z",
  providerActualUsdMicros: null,
  sourceMaxMode: null,
};

describe("cursor usage source scope", () => {
  it("marks incomplete when export bounds cut through execution window", () => {
    const verdict = evaluateSourceScope({
      exportWindow,
      executionWindowStartIso: "2026-07-19T03:00:00.000Z",
      executionWindowEndIso: "2026-07-19T11:30:00.000Z",
      agentSegments: [segment],
      accountedSegmentFingerprints: new Set(["fp-1"]),
      hasRejectedOrAmbiguousForAgent: false,
      langfuseRetrievalComplete: true,
      tokenArithmeticComplete: true,
    });
    expect(verdict.sourceScopeComplete).toBe(false);
    expect(verdict.sourceScopeIncompleteReason).toBe(
      "execution_outside_export_window",
    );
  });

  it("is sourceScopeComplete when export window contains execution", () => {
    const verdict = evaluateSourceScope({
      exportWindow,
      executionWindowStartIso: "2026-07-19T11:00:00.000Z",
      executionWindowEndIso: "2026-07-19T11:30:00.000Z",
      agentSegments: [segment],
      accountedSegmentFingerprints: new Set(["fp-1"]),
      hasRejectedOrAmbiguousForAgent: false,
      langfuseRetrievalComplete: true,
      tokenArithmeticComplete: true,
    });
    expect(verdict.sourceScopeComplete).toBe(true);
    expect(verdict.sourceScopeIncompleteReason).toBeNull();
  });
});
