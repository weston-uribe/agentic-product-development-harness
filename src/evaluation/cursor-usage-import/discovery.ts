import { isEvaluationPhase, phaseInvokesAgent } from "../phases.js";
import { deriveSessionId } from "../identifiers.js";
import type { PricingVariant } from "../telemetry/pricing-registry.js";
import {
  metadataString,
  type LangfuseApiClient,
} from "../langfuse-inspect/client.js";
import { hashCloudAgentId } from "./parse.js";
import { normalizeModelRaw, resolveCanonicalModelId } from "./model-aliases.js";
import {
  CURSOR_USAGE_SCORE_NAMES,
  MULTI_MODEL_EXECUTION_PROVEN_FIELD,
  type AllowedImportPhase,
  type ObservedModelEvidence,
} from "./types.js";

const TRACE_PAGE_LIMIT = 50;
const OBS_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_MAX_TRACES = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function resolveVariantFromMeta(metadata: Record<string, unknown>): PricingVariant | null {
  const ev = metadata.effectiveVariant;
  if (ev === "standard" || ev === "fast") return ev;
  if (metadata.fast === true || metadata.fast === "true") return "fast";
  if (metadata.fast === false || metadata.fast === "false") return "standard";
  return null;
}

function agentIdFromObs(obs: Record<string, unknown>): string | null {
  if (typeof obs.agentId === "string" && obs.agentId.length > 8) {
    return obs.agentId;
  }
  const meta = asRecord(obs.metadata);
  const cursorAgentId = meta ? metadataString(meta, "cursorAgentId") : null;
  if (cursorAgentId && cursorAgentId.length > 8) return cursorAgentId;
  return null;
}

function resolveObsPhase(
  obs: Record<string, unknown>,
  tracePhase: string | null,
): AllowedImportPhase | null {
  const meta = asRecord(obs.metadata);
  const raw =
    (typeof obs.phase === "string" ? obs.phase : null) ??
    (meta ? metadataString(meta, "phase") : null) ??
    tracePhase;
  if (!raw || !isEvaluationPhase(raw)) return null;
  if (!phaseInvokesAgent(raw)) return null;
  return raw;
}

function issueKeyFromTrace(trace: Record<string, unknown>): string | null {
  const direct =
    metadataString(trace, "linearIssueKey") ??
    metadataString(trace, "issueKey") ??
    (typeof trace.linearIssueKey === "string" ? trace.linearIssueKey : null);
  if (direct?.trim()) return direct.trim();
  const meta = asRecord(trace.metadata);
  if (!meta) return null;
  return (
    metadataString(meta, "linearIssueKey") ??
    metadataString(meta, "issueKey")
  );
}

/**
 * Issue keys are often on agent/generation observations rather than the trace
 * root (Langfuse OTEL list/get may only surface resourceAttributes on traces).
 * Prefer a single consistent issue key across harness-bearing observations.
 */
function issueKeyFromObservations(
  observations: Array<Record<string, unknown>>,
): string | null {
  const keys = new Set<string>();
  for (const obs of observations) {
    const meta = asRecord(obs.metadata);
    const key =
      (meta
        ? metadataString(meta, "linearIssueKey") ??
          metadataString(meta, "issueKey")
        : null) ??
      (typeof obs.linearIssueKey === "string" ? obs.linearIssueKey : null) ??
      (typeof obs.issueKey === "string" ? obs.issueKey : null);
    if (key?.trim()) keys.add(key.trim());
  }
  if (keys.size !== 1) return null;
  return [...keys][0]!;
}

function resolveIssueKey(params: {
  trace: Record<string, unknown>;
  observations: Array<Record<string, unknown>>;
}): string | null {
  return (
    issueKeyFromTrace(params.trace) ??
    issueKeyFromObservations(params.observations)
  );
}

export interface UsageCandidate {
  traceId: string;
  sessionId: string | null;
  timestamp: string | null;
  cursorAgentId: string | null;
  cursorAgentIdHash: string | null;
  issueKey: string;
  phase: AllowedImportPhase | null;
  phaseExecutionId: string | null;
  harnessRunId: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  model: string | null;
  effectiveVariant: PricingVariant | null;
  existingCursorScoreNames: string[];
  /** Authoritative observed models with raw + canonical provenance. */
  observedModels: ObservedModelEvidence[];
  /** Convenience view of non-null canonical IDs. */
  observedModelIds: string[];
  /**
   * True only when agent observation metadata has authoritative
   * `multiModelExecutionProven === true` AND ≥2 distinct observed models.
   * No production producer this checkpoint (contract B).
   */
  multiModelExecutionProven: boolean;
  multiModelProofField: typeof MULTI_MODEL_EXECUTION_PROVEN_FIELD;
}

export interface DiscoveryRequestCounters {
  discoveryInvocationId: string;
  traceListRequestCount: number;
  observationRequestCount: number;
}

export interface DiscoverUsageCandidatesResult {
  candidates: UsageCandidate[];
  retrievalComplete: boolean;
  truncationReason?: string;
  pagesFetched: number;
  tracesFetched: number;
  /** Present for real discovery; injected test discovers may omit. */
  requestCounters?: DiscoveryRequestCounters;
}

async function fetchObservationsForTrace(
  client: LangfuseApiClient,
  traceId: string,
  counters: DiscoveryRequestCounters,
): Promise<Array<Record<string, unknown>>> {
  const observations: Array<Record<string, unknown>> = [];
  let page = 1;
  for (;;) {
    counters.observationRequestCount += 1;
    const listed = asRecord(
      await client.api.observations.getMany({
        traceId,
        page,
        limit: OBS_PAGE_LIMIT,
        // Omit prompt/output bodies when the API supports field selection.
        fields: "core,basic,usage,metadata",
      }),
    );
    const data = asArray(listed?.data ?? listed?.observations);
    for (const item of data) {
      const rec = asRecord(item);
      if (rec) observations.push(rec);
    }
    if (data.length < OBS_PAGE_LIMIT) break;
    page += 1;
    if (page > DEFAULT_MAX_PAGES) break;
  }
  return observations;
}

function extractExistingCursorScores(
  trace: Record<string, unknown>,
): string[] {
  const names = new Set<string>();
  for (const item of asArray(trace.scores)) {
    const rec = asRecord(item);
    const name = rec && typeof rec.name === "string" ? rec.name : null;
    if (name && (CURSOR_USAGE_SCORE_NAMES as readonly string[]).includes(name)) {
      names.add(name);
    }
  }
  return [...names].sort();
}

function buildCandidateFromTrace(params: {
  trace: Record<string, unknown>;
  observations: Array<Record<string, unknown>>;
  namespace: string;
}): UsageCandidate | null {
  const traceId = typeof params.trace.id === "string" ? params.trace.id : null;
  if (!traceId) return null;

  const issueKey = resolveIssueKey({
    trace: params.trace,
    observations: params.observations,
  });
  if (!issueKey) return null;

  const sessionId =
    typeof params.trace.sessionId === "string" ? params.trace.sessionId : null;
  const expectedSessionId = deriveSessionId(params.namespace, issueKey);
  if (!sessionId || sessionId !== expectedSessionId) return null;

  const tracePhase =
    typeof params.trace.phase === "string" ? params.trace.phase : null;

  type AgentWin = {
    phases: Set<AllowedImportPhase>;
    windowStart: string | null;
    windowEnd: string | null;
    harnessRunId: string | null;
    phaseExecutionId: string | null;
    cursorAgentId: string | null;
    model: string | null;
    multiModelFlag: boolean;
  };

  const agentsOnTrace = new Map<string, AgentWin>();
  let effectiveVariant: PricingVariant | null = null;
  /** Dedup key → evidence (normalized raw + variant). */
  const observedByKey = new Map<string, ObservedModelEvidence>();

  for (const obs of params.observations) {
    const obsPhase = resolveObsPhase(obs, tracePhase);
    const aid = agentIdFromObs(obs);
    const meta = asRecord(obs.metadata) ?? {};
    const obsId = typeof obs.id === "string" ? obs.id : null;

    // Collect model provenance from agent/generation observations (no prompt/output bodies).
    const rawModel =
      (typeof obs.model === "string" && obs.model.trim()
        ? obs.model
        : null) ??
      (typeof meta.model === "string" && meta.model.trim()
        ? meta.model
        : null);
    if (rawModel && obsId && aid) {
      const normalizedRawModel = normalizeModelRaw(rawModel);
      const canonicalModelId = resolveCanonicalModelId(rawModel);
      const variant = resolveVariantFromMeta(meta) ?? "unknown";
      const key = `${normalizedRawModel}|${variant}|${canonicalModelId ?? "null"}`;
      const existing = observedByKey.get(key);
      if (existing) {
        if (!existing.observationIds.includes(obsId)) {
          existing.observationIds.push(obsId);
          existing.observationIds.sort();
        }
      } else {
        observedByKey.set(key, {
          rawModel,
          normalizedRawModel,
          canonicalModelId,
          variant,
          observationIds: [obsId],
        });
      }
    }

    if (aid && obsPhase) {
      const flagFromMeta = meta[MULTI_MODEL_EXECUTION_PROVEN_FIELD] === true;
      const cur = agentsOnTrace.get(aid) ?? {
        phases: new Set<AllowedImportPhase>(),
        windowStart: null,
        windowEnd: null,
        harnessRunId: null,
        phaseExecutionId: null,
        cursorAgentId: aid,
        model: typeof obs.model === "string" ? obs.model : null,
        multiModelFlag: flagFromMeta,
      };
      cur.phases.add(obsPhase);
      cur.multiModelFlag = cur.multiModelFlag || flagFromMeta;
      const start =
        typeof obs.startTime === "string"
          ? obs.startTime
          : typeof obs.start_time === "string"
            ? obs.start_time
            : null;
      const end =
        typeof obs.endTime === "string"
          ? obs.endTime
          : typeof obs.end_time === "string"
            ? obs.end_time
            : start;
      if (start && (!cur.windowStart || start < cur.windowStart)) {
        cur.windowStart = start;
      }
      if (end && (!cur.windowEnd || end > cur.windowEnd)) {
        cur.windowEnd = end;
      }
      cur.harnessRunId =
        cur.harnessRunId ??
        (typeof obs.harnessRunId === "string" ? obs.harnessRunId : null) ??
        (typeof params.trace.harnessRunId === "string"
          ? params.trace.harnessRunId
          : null);
      cur.phaseExecutionId =
        cur.phaseExecutionId ??
        (typeof obs.phaseExecutionId === "string" ? obs.phaseExecutionId : null) ??
        (typeof params.trace.phaseExecutionId === "string"
          ? params.trace.phaseExecutionId
          : null);
      if (!cur.model && typeof obs.model === "string") {
        cur.model = obs.model;
      }
      agentsOnTrace.set(aid, cur);
    }
    if (!effectiveVariant) {
      effectiveVariant = resolveVariantFromMeta(meta);
    }
  }

  if (agentsOnTrace.size !== 1) return null;
  const win = [...agentsOnTrace.values()][0]!;
  if (win.phases.size !== 1) return null;

  const phase = [...win.phases][0]!;
  const timestamp =
    typeof params.trace.timestamp === "string"
      ? params.trace.timestamp
      : win.windowEnd;

  const observedModels = [...observedByKey.values()].sort((a, b) =>
    a.normalizedRawModel.localeCompare(b.normalizedRawModel),
  );
  const observedModelIds = [
    ...new Set(
      observedModels
        .map((o) => o.canonicalModelId)
        .filter((id): id is string => id != null),
    ),
  ].sort();
  const distinctModels =
    new Set(observedModels.map((o) => o.normalizedRawModel)).size +
    observedModelIds.length;
  const multiModelExecutionProven =
    win.multiModelFlag &&
    (observedModelIds.length >= 2 ||
      new Set(observedModels.map((o) => o.normalizedRawModel)).size >= 2);

  void distinctModels;

  return {
    traceId,
    sessionId,
    timestamp,
    cursorAgentId: win.cursorAgentId,
    cursorAgentIdHash: win.cursorAgentId
      ? hashCloudAgentId(win.cursorAgentId)
      : null,
    issueKey,
    phase,
    phaseExecutionId: win.phaseExecutionId,
    harnessRunId: win.harnessRunId,
    windowStart: win.windowStart,
    windowEnd: win.windowEnd,
    model: win.model,
    effectiveVariant,
    existingCursorScoreNames: extractExistingCursorScores(params.trace),
    observedModels,
    observedModelIds,
    multiModelExecutionProven,
    multiModelProofField: MULTI_MODEL_EXECUTION_PROVEN_FIELD,
  };
}

/**
 * Discover Langfuse traces in a time window that can receive cursor usage scores.
 * Namespace isolation: issue key required; session must match deriveSessionId.
 */
let discoveryInvocationSeq = 0;

export async function discoverUsageCandidates(params: {
  client: LangfuseApiClient;
  namespace: string;
  environment?: string;
  fromTimestamp: string;
  toTimestamp: string;
  maxPages?: number;
  maxTraces?: number;
  onProgress?: (p: { pages: number; traces: number }) => void;
  discoveryInvocationId?: string;
}): Promise<DiscoverUsageCandidatesResult> {
  const maxPages = params.maxPages ?? DEFAULT_MAX_PAGES;
  const maxTraces = params.maxTraces ?? DEFAULT_MAX_TRACES;
  const candidates: UsageCandidate[] = [];
  let page = 1;
  let pagesFetched = 0;
  let tracesFetched = 0;
  let retrievalComplete = false;
  let truncationReason: string | undefined;
  discoveryInvocationSeq += 1;
  const requestCounters: DiscoveryRequestCounters = {
    discoveryInvocationId:
      params.discoveryInvocationId ?? `discovery-${discoveryInvocationSeq}`,
    traceListRequestCount: 0,
    observationRequestCount: 0,
  };

  while (page <= maxPages && tracesFetched < maxTraces) {
    const listParams: Record<string, unknown> = {
      page,
      limit: TRACE_PAGE_LIMIT,
      fromTimestamp: params.fromTimestamp,
      toTimestamp: params.toTimestamp,
    };
    if (params.environment?.trim()) {
      listParams.environment = params.environment.trim();
    }

    requestCounters.traceListRequestCount += 1;
    const listed = asRecord(await params.client.api.trace.list(listParams));
    pagesFetched += 1;
    const data = asArray(listed?.data);
    for (const item of data) {
      if (tracesFetched >= maxTraces) break;
      const trace = asRecord(item);
      if (!trace) continue;
      tracesFetched += 1;
      const traceId = typeof trace.id === "string" ? trace.id : null;
      if (!traceId) continue;
      const observations = await fetchObservationsForTrace(
        params.client,
        traceId,
        requestCounters,
      );
      const candidate = buildCandidateFromTrace({
        trace,
        observations,
        namespace: params.namespace,
      });
      if (candidate) candidates.push(candidate);
    }

    params.onProgress?.({ pages: pagesFetched, traces: tracesFetched });

    const meta = asRecord(listed?.meta);
    const totalPages =
      typeof meta?.totalPages === "number" ? meta.totalPages : null;
    const metaPage = typeof meta?.page === "number" ? meta.page : page;

    if (meta && totalPages != null) {
      if (metaPage >= totalPages || data.length === 0) {
        retrievalComplete = true;
        break;
      }
      page += 1;
      continue;
    }

    if (!meta) {
      if (data.length >= TRACE_PAGE_LIMIT) {
        truncationReason = "trace_list_may_be_truncated";
        retrievalComplete = false;
        break;
      }
      retrievalComplete = true;
      break;
    }

    if (data.length < TRACE_PAGE_LIMIT) {
      retrievalComplete = true;
      break;
    }

    truncationReason = "trace_list_may_be_truncated";
    retrievalComplete = false;
    break;
  }

  if (!retrievalComplete && !truncationReason) {
    if (page > maxPages || tracesFetched >= maxTraces) {
      truncationReason = "trace_list_may_be_truncated";
    }
  }

  return {
    candidates,
    retrievalComplete,
    ...(truncationReason ? { truncationReason } : {}),
    pagesFetched,
    tracesFetched,
    requestCounters,
  };
}
