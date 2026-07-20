import { CURSOR_USAGE_SCORE_NAMES, type PhaseImportAttachment } from "./types.js";

export interface FetchedScore {
  id: string;
  name: string;
  traceId: string | null;
  value: unknown;
  dataType: string | null;
  timestamp: string | null;
}

function normalizeBool(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return null;
}

export interface VerifyResult {
  verified: boolean;
  logicalScoreCount: number;
  mismatches: string[];
}

/**
 * Verify expected scores exist by deterministic id/name and match private aggregates.
 */
export function verifyImportedScores(params: {
  attachments: PhaseImportAttachment[];
  fetchedScores: FetchedScore[];
}): VerifyResult {
  const mismatches: string[] = [];
  const expectedIds = new Set<string>();

  for (const att of params.attachments) {
    for (const score of att.scores) {
      expectedIds.add(score.id);
      const matches = params.fetchedScores.filter((s) => s.id === score.id);
      if (matches.length === 0) {
        // fallback: name (+ optional traceId when present on fetched score)
        const byName = params.fetchedScores.filter(
          (s) =>
            s.name === score.name &&
            (s.traceId == null || s.traceId === score.traceId),
        );
        if (byName.length === 0) {
          mismatches.push(`missing_score:${score.name}`);
          continue;
        }
        if (byName.length > 1) {
          // Prefer exact id-less duplicates only when multiple share same name+trace
          const sameTrace = byName.filter((s) => s.traceId === score.traceId);
          if (sameTrace.length > 1) {
            mismatches.push(`duplicate_logical_score:${score.name}`);
          }
        }
        const got = byName[0]!;
        if (!valuesMatch(score.value, got.value, score.dataType)) {
          mismatches.push(`value_mismatch:${score.name}`);
        }
        continue;
      }
      if (matches.length > 1) {
        mismatches.push(`duplicate_score_id:${score.name}`);
      }
      const got = matches[0]!;
      if (got.name !== score.name) {
        mismatches.push(`name_mismatch:${score.name}`);
      }
      if (got.traceId && got.traceId !== score.traceId) {
        mismatches.push(`wrong_trace:${score.name}`);
      }
      if (!valuesMatch(score.value, got.value, score.dataType)) {
        mismatches.push(`value_mismatch:${score.name}`);
      }
    }
  }

  const foundExpected = new Set<string>();
  for (const id of expectedIds) {
    if (params.fetchedScores.some((s) => s.id === id)) {
      foundExpected.add(id);
    }
  }
  for (const att of params.attachments) {
    for (const score of att.scores) {
      if (foundExpected.has(score.id)) continue;
      const byName = params.fetchedScores.find(
        (s) =>
          s.name === score.name &&
          (s.traceId == null || s.traceId === score.traceId) &&
          valuesMatch(score.value, s.value, score.dataType),
      );
      if (byName) foundExpected.add(score.id);
    }
  }

  return {
    verified: mismatches.length === 0,
    logicalScoreCount: foundExpected.size,
    mismatches,
  };
}

function valuesMatch(
  expected: boolean | number | string,
  got: unknown,
  dataType: string,
): boolean {
  if (dataType === "BOOLEAN") {
    const b = normalizeBool(got);
    return b === Boolean(expected);
  }
  if (dataType === "NUMERIC") {
    const n = normalizeNumber(got);
    if (n == null || typeof expected !== "number") return false;
    return Math.abs(n - expected) < 1e-9;
  }
  return got === expected;
}

export function evaluateVerdicts(params: {
  arithmeticValid: boolean;
  attachments: PhaseImportAttachment[];
  verify: VerifyResult | null;
  generationCostComplete: boolean;
}): {
  tokenAcceptance: boolean;
  costProxyAvailability: boolean;
  exactMonetaryCostAcceptance: boolean;
  tokenAcceptanceReason: string;
  costProxyAvailabilityReason: string;
  exactMonetaryCostAcceptanceReason: string;
} {
  const { arithmeticValid, attachments, verify, generationCostComplete } = params;

  if (!arithmeticValid) {
    return {
      tokenAcceptance: false,
      costProxyAvailability: false,
      exactMonetaryCostAcceptance: false,
      tokenAcceptanceReason: "csv_arithmetic_invalid",
      costProxyAvailabilityReason: "no_attachments",
      exactMonetaryCostAcceptanceReason: "generationCostComplete_false",
    };
  }
  if (attachments.length === 0) {
    return {
      tokenAcceptance: false,
      costProxyAvailability: false,
      exactMonetaryCostAcceptance: false,
      tokenAcceptanceReason: "no_unambiguous_attachments",
      costProxyAvailabilityReason: "no_attachments",
      exactMonetaryCostAcceptanceReason: "generationCostComplete_false",
    };
  }

  const totalsOk = attachments.every(
    (a) =>
      a.aggregate.tokens.totalTokens ===
      a.aggregate.tokens.inputTokens +
        a.aggregate.tokens.cacheWriteTokens +
        a.aggregate.tokens.cacheReadTokens +
        a.aggregate.tokens.outputTokens,
  );
  const expectedScoreCount = attachments.length * CURSOR_USAGE_SCORE_NAMES.length;
  const verifyOk =
    verify != null &&
    verify.verified &&
    verify.logicalScoreCount === expectedScoreCount;

  const tokenAcceptance = totalsOk && verifyOk;
  const costProxyAvailability =
    verifyOk &&
    attachments.every((a) =>
      a.scores.some(
        (s) => s.name === "cursor_cost_proxy_available" && s.value === true,
      ),
    );

  return {
    tokenAcceptance,
    costProxyAvailability,
    exactMonetaryCostAcceptance: generationCostComplete === true,
    tokenAcceptanceReason: tokenAcceptance
      ? "score_backed_verified"
      : !totalsOk
        ? "token_bucket_sum_invalid"
        : verify == null
          ? "verify_not_run"
          : `verify_failed:${verify.mismatches.slice(0, 3).join(",")}`,
    costProxyAvailabilityReason: costProxyAvailability
      ? "proxy_scores_verified"
      : "proxy_scores_missing_or_unverified",
    exactMonetaryCostAcceptanceReason: generationCostComplete
      ? "generationCostComplete_true"
      : "generationCostComplete_false_intentionally",
  };
}
