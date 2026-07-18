import type { AgentCostRecord, AgentUsageRecord } from "./types.js";

/** Cursor SDK @1.0.23 does not expose cost — always unavailable. */
export function unavailableCost(): AgentCostRecord {
  return { costSource: "unavailable" };
}

export function buildUsageRecord(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
} | null | undefined): AgentUsageRecord | null {
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const record: AgentUsageRecord = {
    cost: unavailableCost(),
  };
  if (typeof usage.inputTokens === "number") {
    record.inputTokens = usage.inputTokens;
  }
  if (typeof usage.outputTokens === "number") {
    record.outputTokens = usage.outputTokens;
  }
  if (typeof usage.totalTokens === "number") {
    record.totalTokens = usage.totalTokens;
  }
  if (typeof usage.cacheReadTokens === "number") {
    record.cacheReadTokens = usage.cacheReadTokens;
  }
  if (typeof usage.cacheWriteTokens === "number") {
    record.cacheWriteTokens = usage.cacheWriteTokens;
  }
  if (typeof usage.reasoningTokens === "number") {
    record.reasoningTokens = usage.reasoningTokens;
  }
  const hasTokens =
    record.inputTokens !== undefined ||
    record.outputTokens !== undefined ||
    record.totalTokens !== undefined ||
    record.cacheReadTokens !== undefined ||
    record.cacheWriteTokens !== undefined ||
    record.reasoningTokens !== undefined;
  return hasTokens ? record : { cost: unavailableCost() };
}
