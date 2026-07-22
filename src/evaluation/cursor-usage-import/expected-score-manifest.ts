import { createHash } from "node:crypto";
import { SCORE_CONTRACT_VERSION } from "./canonical.js";
import type { EvaluationScoreInput } from "../types.js";
import type { PricingVariant } from "../telemetry/pricing-registry.js";
import { PRICING_REGISTRY_VERSION } from "../telemetry/pricing-registry.js";

export interface SegmentPricingManifestEntry {
  canonicalModelId: string;
  effectiveVariant: PricingVariant;
  pricingRegistryVersion: string;
  matchedPricingEntryEffectiveDate: string | null;
  operatorApprovedSourceIdentifier: string;
  inputUsdPer1M: string;
  outputUsdPer1M: string;
  cacheReadUsdPer1M: string | null;
  cacheWriteUsdPer1M: string | null;
  reasoningUsdPer1M: string | null;
  nonzeroTokenBuckets: {
    inputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
  };
  completenessResult: "complete" | "incomplete";
  completenessReason: string | null;
}

export interface ExpectedScoreManifestEntry {
  scoreId: string;
  targetTraceId: string;
  scoreName: string;
  dataType: string;
  /** Deterministic decimal / micro-USD string — never unconstrained float toString. */
  canonicalValueSerialization: string;
  commentProvenanceFingerprint: string;
  publicSafeMetadataDigest: string;
  sourceBundleFingerprint: string;
  issueKey: string;
  phase: string;
  scoreContractVersion: string;
  pricingManifest: SegmentPricingManifestEntry | null;
}

export interface ExpectedScoreManifest {
  schemaVersion: 1;
  targetTraceIds: string[];
  scores: ExpectedScoreManifestEntry[];
  discoverySnapshotDigest: string;
  targetTraceSetDigest: string;
  expectedScoreManifestDigest: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function digestCanonical(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/** Serialize numeric score values deterministically (fixed decimal, no float noise). */
export function serializeScoreValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "non_finite";
    if (Number.isInteger(value)) return String(value);
    // Fixed 12 decimal places then trim trailing zeros.
    const fixed = value.toFixed(12).replace(/\.?0+$/, "");
    return fixed === "-0" ? "0" : fixed;
  }
  if (typeof value === "string") return value;
  return stableStringify(value);
}

export function buildExpectedScoreManifest(params: {
  scores: EvaluationScoreInput[];
  issueKeyByTraceId: Record<string, string>;
  phaseByTraceId: Record<string, string>;
  sourceBundleFingerprintByTraceId: Record<string, string>;
  pricingByScoreId?: Record<string, SegmentPricingManifestEntry | null>;
  discoverySnapshotDigest: string;
}): ExpectedScoreManifest {
  const entries: ExpectedScoreManifestEntry[] = params.scores.map((score) => {
    const publicMeta = { ...(score.metadata ?? {}) };
    // Strip anything that might be private if present under known keys.
    delete (publicMeta as Record<string, unknown>).cloudAgentId;
    delete (publicMeta as Record<string, unknown>).prompt;
    delete (publicMeta as Record<string, unknown>).output;
    const targetTraceId = score.traceId ?? "";

    return {
      scoreId: score.id,
      targetTraceId,
      scoreName: score.name,
      dataType: score.dataType,
      canonicalValueSerialization: serializeScoreValue(score.value),
      commentProvenanceFingerprint: digestCanonical(score.comment ?? ""),
      publicSafeMetadataDigest: digestCanonical(publicMeta),
      sourceBundleFingerprint:
        params.sourceBundleFingerprintByTraceId[targetTraceId] ?? "",
      issueKey: params.issueKeyByTraceId[targetTraceId] ?? "",
      phase: params.phaseByTraceId[targetTraceId] ?? "",
      scoreContractVersion: SCORE_CONTRACT_VERSION,
      pricingManifest: params.pricingByScoreId?.[score.id] ?? null,
    };
  });

  entries.sort((a, b) => {
    const c = a.scoreId.localeCompare(b.scoreId);
    return c !== 0 ? c : a.targetTraceId.localeCompare(b.targetTraceId);
  });

  const targetTraceIds = [
    ...new Set(entries.map((e) => e.targetTraceId)),
  ].sort();
  const targetTraceSetDigest = digestCanonical(targetTraceIds);
  const expectedScoreManifestDigest = digestCanonical({
    scores: entries,
    targetTraceIds,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    pricingRegistryVersion: PRICING_REGISTRY_VERSION,
  });

  return {
    schemaVersion: 1,
    targetTraceIds,
    scores: entries,
    discoverySnapshotDigest: params.discoverySnapshotDigest,
    targetTraceSetDigest,
    expectedScoreManifestDigest,
  };
}

export function discoverySnapshotDigestFromCandidates(
  candidates: Array<{
    traceId: string;
    cursorAgentIdHash: string | null;
    issueKey: string;
    phase: string | null;
    observedModelIds: string[];
    multiModelExecutionProven: boolean;
  }>,
): string {
  const rows = candidates
    .map((c) => ({
      traceId: c.traceId,
      cursorAgentIdHash: c.cursorAgentIdHash,
      issueKey: c.issueKey,
      phase: c.phase,
      observedModelIds: [...c.observedModelIds].sort(),
      multiModelExecutionProven: c.multiModelExecutionProven,
    }))
    .sort((a, b) => a.traceId.localeCompare(b.traceId));
  return digestCanonical(rows);
}
