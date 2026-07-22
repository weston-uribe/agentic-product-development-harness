import type { PricingVariant } from "../telemetry/pricing-registry.js";
import {
  segmentKey,
  type AttributionCapability,
  type CanonicalUsageEvent,
  type UsageSegment,
} from "./canonical.js";
import { hashCloudAgentId } from "./parse.js";
import { resolveCanonicalModelId } from "./model-aliases.js";
import type { PhaseJoinTarget, TokenBuckets } from "./types.js";
import type { UsageCandidate } from "./discovery.js";

export type AttributionState =
  | "matched"
  | "unmatched"
  | "ambiguous"
  | "conflict"
  | "aggregate_only"
  | "rejected";

export interface AttributedSegment {
  segment: UsageSegment;
  state: AttributionState;
  candidate: UsageCandidate | null;
  reason?: string;
}

export interface TraceUsageBundle {
  traceId: string;
  join: PhaseJoinTarget;
  tokens: TokenBuckets;
  segmentBreakdown: UsageSegment[];
  matchedFingerprints: string[];
  states: AttributionState[];
}

const INGESTION_SLACK_MS = 6 * 60 * 60 * 1000;

function emptyTokens(): TokenBuckets {
  return {
    inputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function addTokens(a: TokenBuckets, b: TokenBuckets): TokenBuckets {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function parseIso(s: string): number | null {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function timestampsFitWindow(
  segment: UsageSegment,
  windowStart: string | null,
  windowEnd: string | null,
): boolean {
  if (!segment.timestampMin || !segment.timestampMax) return false;
  if (!windowStart || !windowEnd) return false;
  const start = parseIso(windowStart);
  const end = parseIso(windowEnd);
  const min = parseIso(segment.timestampMin);
  const max = parseIso(segment.timestampMax);
  if (start == null || end == null || min == null || max == null) return false;
  return min >= start - INGESTION_SLACK_MS && max <= end + INGESTION_SLACK_MS;
}

function costClassFromEvent(event: CanonicalUsageEvent): UsageSegment["billingSemantic"] {
  return event.billingCategory;
}

/**
 * Build per-agent model segments from canonical usage events.
 * Admin aggregate_only events are retained for analytics but marked separately at attribution.
 */
export function buildSegmentsFromCanonicalEvents(
  events: CanonicalUsageEvent[],
): UsageSegment[] {
  const buckets = new Map<string, UsageSegment>();

  for (const event of events) {
    if (!event.cloudAgentId) continue;
    const modelIdCanonical =
      event.modelIdCanonical ?? resolveCanonicalModelId(event.modelRaw);
    const billingSemantic = costClassFromEvent(event);
    const key = segmentKey({
      cloudAgentId: event.cloudAgentId,
      modelIdCanonical,
      modelRaw: event.modelRaw,
      billingSemantic,
    });

    let seg = buckets.get(key);
    if (!seg) {
      seg = {
        cloudAgentId: event.cloudAgentId,
        cloudAgentIdHash: hashCloudAgentId(event.cloudAgentId),
        modelRaw: event.modelRaw,
        modelIdCanonical,
        billingSemantic,
        tokens: emptyTokens(),
        rowCount: 0,
        fingerprints: [],
        timestampMin: null,
        timestampMax: null,
        providerActualUsdMicros: null,
        sourceMaxMode: event.sourceMaxMode,
      };
      buckets.set(key, seg);
    }

    if (!seg.fingerprints.includes(event.sourceEventFingerprint)) {
      seg.fingerprints.push(event.sourceEventFingerprint);
      seg.tokens = addTokens(seg.tokens, event.tokens);
      seg.rowCount += 1;
      if (
        !seg.timestampMin ||
        (event.timestampIso && event.timestampIso < seg.timestampMin)
      ) {
        seg.timestampMin = event.timestampIso;
      }
      if (
        !seg.timestampMax ||
        (event.timestampIso && event.timestampIso > seg.timestampMax)
      ) {
        seg.timestampMax = event.timestampIso;
      }
      if (event.providerActualUsdMicros) {
        seg.providerActualUsdMicros = event.providerActualUsdMicros;
      }
    }
  }

  for (const seg of buckets.values()) {
    seg.fingerprints.sort();
  }
  return [...buckets.values()];
}

function segmentCapability(segment: UsageSegment, events: CanonicalUsageEvent[]): AttributionCapability {
  const fps = new Set(segment.fingerprints);
  for (const e of events) {
    if (fps.has(e.sourceEventFingerprint)) {
      return e.capability;
    }
  }
  return "issue_phase_scores";
}

/**
 * Attribute each usage segment to at most one Langfuse candidate trace.
 */
export function attributeSegmentsToCandidates(params: {
  segments: UsageSegment[];
  candidates: UsageCandidate[];
  canonicalEvents?: CanonicalUsageEvent[];
}): AttributedSegment[] {
  const events = params.canonicalEvents ?? [];
  const byAgent = new Map<string, UsageCandidate[]>();
  for (const c of params.candidates) {
    if (!c.cursorAgentId) continue;
    const list = byAgent.get(c.cursorAgentId) ?? [];
    list.push(c);
    byAgent.set(c.cursorAgentId, list);
  }

  return params.segments.map((segment) => {
    const capability = segmentCapability(segment, events);
    if (capability === "aggregate_only") {
      return {
        segment,
        state: "aggregate_only" as const,
        candidate: null,
        reason: "admin_aggregate_only",
      };
    }

    const cands = (byAgent.get(segment.cloudAgentId) ?? []).filter((c) =>
      timestampsFitWindow(segment, c.windowStart, c.windowEnd),
    );

    if (cands.length === 0) {
      return {
        segment,
        state: "unmatched" as const,
        candidate: null,
        reason: "no_candidate_for_agent",
      };
    }

    const traceIds = new Set(cands.map((c) => c.traceId));
    if (traceIds.size > 1) {
      return {
        segment,
        state: "ambiguous" as const,
        candidate: null,
        reason: "multiple_traces_for_agent",
      };
    }

    const phases = new Set(cands.map((c) => c.phase).filter(Boolean));
    if (phases.size > 1) {
      return {
        segment,
        state: "ambiguous" as const,
        candidate: null,
        reason: "multiple_phases_for_agent",
      };
    }

    const candidate = cands[0]!;
    if (!candidate.effectiveVariant || !candidate.phase) {
      return {
        segment,
        state: "rejected" as const,
        candidate: null,
        reason: "candidate_missing_variant_or_phase",
      };
    }

    return {
      segment,
      state: "matched" as const,
      candidate,
    };
  });
}

function traceEndTimestamp(candidate: UsageCandidate): string {
  return candidate.windowEnd ?? candidate.timestamp ?? new Date(0).toISOString();
}

/**
 * Bundle matched segments by traceId. Multi-model segments for one agent collapse
 * into one trace bundle with segmentBreakdown preserved.
 * Never includes aggregate_only segments in score-bound bundles.
 */
export function bundleAttributedSegments(params: {
  attributed: AttributedSegment[];
  namespace: string;
}): {
  bundles: TraceUsageBundle[];
  skipped: Array<{ reason: string; cloudAgentIdHash?: string; phase?: string }>;
} {
  const skipped: Array<{ reason: string; cloudAgentIdHash?: string; phase?: string }> = [];
  const byTrace = new Map<
    string,
    {
      candidate: UsageCandidate;
      segments: UsageSegment[];
      states: AttributionState[];
    }
  >();

  for (const row of params.attributed) {
    if (row.state === "aggregate_only") {
      continue;
    }
    if (row.state !== "matched" || !row.candidate) {
      skipped.push({
        reason: row.reason ?? `segment_${row.state}`,
        cloudAgentIdHash: row.segment.cloudAgentIdHash,
      });
      continue;
    }

    const traceId = row.candidate.traceId;
    const existing = byTrace.get(traceId);
    if (existing && existing.candidate.cursorAgentId !== row.candidate.cursorAgentId) {
      skipped.push({
        reason: "conflict_multiple_agents_on_trace",
        cloudAgentIdHash: row.segment.cloudAgentIdHash,
        phase: row.candidate.phase ?? undefined,
      });
      continue;
    }

    const bucket = existing ?? {
      candidate: row.candidate,
      segments: [] as UsageSegment[],
      states: [] as AttributionState[],
    };
    bucket.segments.push(row.segment);
    bucket.states.push(row.state);
    byTrace.set(traceId, bucket);
  }

  const bundles: TraceUsageBundle[] = [];
  for (const [traceId, bucket] of byTrace) {
    const candidate = bucket.candidate;
    if (!candidate.cursorAgentId || !candidate.phase || !candidate.effectiveVariant) {
      skipped.push({
        reason: "bundle_missing_join_fields",
        cloudAgentIdHash: candidate.cursorAgentIdHash ?? undefined,
      });
      continue;
    }

    let tokens = emptyTokens();
    for (const seg of bucket.segments) {
      tokens = addTokens(tokens, seg.tokens);
    }

    const join: PhaseJoinTarget = {
      phase: candidate.phase,
      traceId,
      traceEndTimestamp: traceEndTimestamp(candidate),
      harnessRunId: candidate.harnessRunId,
      phaseExecutionId: candidate.phaseExecutionId,
      cursorAgentId: candidate.cursorAgentId,
      cursorAgentIdHash: hashCloudAgentId(candidate.cursorAgentId),
      effectiveVariant: candidate.effectiveVariant as PricingVariant,
      sdkFast: candidate.effectiveVariant === "fast",
      windowStart: candidate.windowStart,
      windowEnd: candidate.windowEnd,
    };

    bundles.push({
      traceId,
      join,
      tokens,
      segmentBreakdown: bucket.segments,
      matchedFingerprints: bucket.segments.flatMap((s) => s.fingerprints),
      states: bucket.states,
    });
  }

  return { bundles, skipped };
}
