/**
 * Versioned pricing registry for estimated costs.
 * Composer 2.5 has no operator-approved entry — never invent prices.
 */

export const PRICING_REGISTRY_VERSION = "2026-07-18.v1" as const;

export interface ModelPriceEntry {
  modelId: string;
  /** USD per 1M input tokens */
  inputUsdPer1M: number;
  /** USD per 1M output tokens */
  outputUsdPer1M: number;
  cacheReadUsdPer1M?: number;
  cacheWriteUsdPer1M?: number;
  reasoningUsdPer1M?: number;
  source: "operator_approved";
}

/** Empty by design until operator-approved Composer/other rates exist. */
const REGISTRY: ReadonlyArray<ModelPriceEntry> = [];

export function lookupModelPrice(modelId: string | null | undefined): ModelPriceEntry | null {
  if (!modelId) return null;
  const normalized = modelId.trim().toLowerCase();
  return (
    REGISTRY.find((e) => e.modelId.toLowerCase() === normalized) ?? null
  );
}

export function estimateCostUsd(params: {
  modelId: string | null | undefined;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}): { estimatedCostUsd: number; pricingRegistryVersion: string } | null {
  const entry = lookupModelPrice(params.modelId);
  if (!entry) return null;
  const input = params.inputTokens ?? 0;
  const output = params.outputTokens ?? 0;
  const cacheRead = params.cacheReadTokens ?? 0;
  const cacheWrite = params.cacheWriteTokens ?? 0;
  const reasoning = params.reasoningTokens ?? 0;
  const usd =
    (input / 1_000_000) * entry.inputUsdPer1M +
    (output / 1_000_000) * entry.outputUsdPer1M +
    (cacheRead / 1_000_000) * (entry.cacheReadUsdPer1M ?? 0) +
    (cacheWrite / 1_000_000) * (entry.cacheWriteUsdPer1M ?? 0) +
    (reasoning / 1_000_000) * (entry.reasoningUsdPer1M ?? 0);
  return {
    estimatedCostUsd: usd,
    pricingRegistryVersion: PRICING_REGISTRY_VERSION,
  };
}
