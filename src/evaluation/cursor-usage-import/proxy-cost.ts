import {
  lookupModelPrice,
  PRICING_REGISTRY_VERSION,
  type ModelPriceEntry,
  type PricingVariant,
} from "../telemetry/pricing-registry.js";
import type { TokenBuckets } from "./types.js";
import type { SegmentPricingManifestEntry } from "./expected-score-manifest.js";
import { serializeScoreValue } from "./expected-score-manifest.js";

export interface ProxyCostResult {
  knownNoncacheCostUsd: number;
  allInputAtListRateUsd: number;
  pricingRegistryVersion: string;
  effectiveVariant: PricingVariant;
  pricingEntry: ModelPriceEntry;
  pricingManifest: SegmentPricingManifestEntry;
}

/**
 * Honest cost proxies using published Composer 2.5 input/output list rates only.
 * Does NOT call estimateCostUsd (which zero-defaults missing cache rates).
 */
export function computeCostProxies(params: {
  modelId: string;
  effectiveVariant: PricingVariant;
  tokens: TokenBuckets;
  operatorApprovedSourceIdentifier?: string;
}): ProxyCostResult | null {
  const paramsForLookup =
    params.effectiveVariant === "fast"
      ? ([{ id: "fast", value: "true" }] as const)
      : ([{ id: "fast", value: "false" }] as const);
  const entry = lookupModelPrice(params.modelId, [...paramsForLookup]);
  if (!entry) return null;

  const { inputTokens, cacheReadTokens, cacheWriteTokens, outputTokens } =
    params.tokens;

  // Nonzero cache buckets without a cache rate → incomplete for totals that need cache.
  const cacheRateMissing =
    (cacheReadTokens > 0 && entry.cacheReadUsdPer1M == null) ||
    (cacheWriteTokens > 0 && entry.cacheWriteUsdPer1M == null);

  const knownNoncacheCostUsd =
    (inputTokens / 1_000_000) * entry.inputUsdPer1M +
    (outputTokens / 1_000_000) * entry.outputUsdPer1M;
  const allInputAtListRateUsd =
    ((inputTokens + cacheReadTokens + cacheWriteTokens) / 1_000_000) *
      entry.inputUsdPer1M +
    (outputTokens / 1_000_000) * entry.outputUsdPer1M;

  const pricingManifest: SegmentPricingManifestEntry = {
    canonicalModelId: params.modelId,
    effectiveVariant: entry.variant,
    pricingRegistryVersion: PRICING_REGISTRY_VERSION,
    matchedPricingEntryEffectiveDate: entry.effectiveDate ?? null,
    operatorApprovedSourceIdentifier:
      params.operatorApprovedSourceIdentifier ?? "pricing_registry",
    inputUsdPer1M: serializeScoreValue(entry.inputUsdPer1M),
    outputUsdPer1M: serializeScoreValue(entry.outputUsdPer1M),
    cacheReadUsdPer1M:
      entry.cacheReadUsdPer1M == null
        ? null
        : serializeScoreValue(entry.cacheReadUsdPer1M),
    cacheWriteUsdPer1M:
      entry.cacheWriteUsdPer1M == null
        ? null
        : serializeScoreValue(entry.cacheWriteUsdPer1M),
    reasoningUsdPer1M:
      entry.reasoningUsdPer1M == null
        ? null
        : serializeScoreValue(entry.reasoningUsdPer1M),
    nonzeroTokenBuckets: {
      inputTokens,
      cacheWriteTokens,
      cacheReadTokens,
      outputTokens,
    },
    completenessResult: cacheRateMissing ? "incomplete" : "complete",
    completenessReason: cacheRateMissing
      ? "nonzero_cache_without_cache_rate"
      : null,
  };

  return {
    knownNoncacheCostUsd,
    allInputAtListRateUsd,
    pricingRegistryVersion: PRICING_REGISTRY_VERSION,
    effectiveVariant: entry.variant,
    pricingEntry: entry,
    pricingManifest,
  };
}
