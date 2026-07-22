import { describe, expect, it } from "vitest";
import { deriveScoreId } from "../../src/evaluation/identifiers.js";
import {
  attributeSegmentsToCandidates,
  buildSegmentsFromCanonicalEvents,
  bundleAttributedSegments,
} from "../../src/evaluation/cursor-usage-import/attribution.js";
import { eventFromCsvRow } from "../../src/evaluation/cursor-usage-import/canonical.js";
import { CURSOR_USAGE_IMPORTER_VERSION } from "../../src/evaluation/cursor-usage-import/types.js";
import { buildPhaseUsageScores } from "../../src/evaluation/cursor-usage-import/scores.js";
import type { UsageCandidate } from "../../src/evaluation/cursor-usage-import/discovery.js";

const AGENT_ID = "bc-agent-multimodel-001";

function makeEvent(model: string, fingerprint: string) {
  return eventFromCsvRow({
    importerVersion: CURSOR_USAGE_IMPORTER_VERSION,
    sourceDigest: "digest",
    timestampIso: "2026-07-19T12:00:00.000Z",
    cloudAgentId: AGENT_ID,
    automationId: "",
    model,
    maxMode: "false",
    kind: "Included",
    tokens: {
      inputTokens: 10,
      cacheWriteTokens: 5,
      cacheReadTokens: 3,
      outputTokens: 2,
      totalTokens: 20,
    },
    costClass: "included_like",
    fingerprint,
  });
}

function makeCandidate(): UsageCandidate {
  return {
    traceId: "trace-implementation",
    sessionId: "a".repeat(64),
    timestamp: "2026-07-19T12:30:00.000Z",
    cursorAgentId: AGENT_ID,
    cursorAgentIdHash: "hash",
    issueKey: "TT-FIXTURE",
    phase: "implementation",
    phaseExecutionId: "pe-1",
    harnessRunId: "hr-1",
    windowStart: "2026-07-19T11:55:00.000Z",
    windowEnd: "2026-07-19T12:35:00.000Z",
    model: "composer-2.5",
    effectiveVariant: "standard",
    existingCursorScoreNames: [],
  };
}

describe("cursor usage multimodel attribution", () => {
  it("bundles two models for one agent into one trace without score id collision", () => {
    const events = [
      makeEvent("composer-2.5", "fp-model-a"),
      makeEvent("composer-2-fast", "fp-model-b"),
    ];
    const segments = buildSegmentsFromCanonicalEvents(events);
    expect(segments).toHaveLength(2);

    const attributed = attributeSegmentsToCandidates({
      segments,
      candidates: [makeCandidate()],
      canonicalEvents: events,
    });
    expect(attributed.every((a) => a.state === "matched")).toBe(true);

    const { bundles } = bundleAttributedSegments({
      attributed,
      namespace: "default",
    });
    expect(bundles).toHaveLength(1);
    expect(bundles[0]!.segmentBreakdown).toHaveLength(2);
    expect(bundles[0]!.tokens.totalTokens).toBe(40);

    const join = bundles[0]!.join;
    const scores = buildPhaseUsageScores({
      namespace: "default",
      join,
      tokens: bundles[0]!.tokens,
      knownNoncacheCostUsd: 0.01,
      allInputAtListRateUsd: 0.02,
      tokenUsageComplete: true,
      sourceScopeComplete: true,
      listPriceEquivalentComplete: false,
      providerActualCostComplete: false,
      costProxyAvailable: true,
    });

    const ids = scores.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const name of [
      "cursor_input_tokens",
      "cursor_total_tokens",
      "cursor_source_scope_complete",
    ]) {
      expect(ids).toContain(
        deriveScoreId("default", "trace", join.traceId, name),
      );
    }
  });
});
