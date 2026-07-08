import { cursorAgentProvider } from "./cursor-provider.js";
import { getAgentProvider } from "./provider.js";
import type {
  AgentHandle,
  ImplementationAgentParams,
  IntegrationRepairAgentParams,
  PlanningAgentParams,
  RevisionAgentParams,
  SendAndObserveOptions,
} from "./types.js";
import type { HarnessConfig } from "../config/types.js";
import type { EventLogger } from "../artifacts/events.js";

export function resolveModelId(config: HarnessConfig): string {
  return getAgentProvider(config).resolveModelId(config);
}

export function createPlanningAgent(
  params: PlanningAgentParams,
): Promise<AgentHandle> {
  return getAgentProvider(params.config).createPlanningAgent(params);
}

export function createImplementationAgent(
  params: ImplementationAgentParams,
): Promise<AgentHandle> {
  return getAgentProvider(params.config).createImplementationAgent(params);
}

export function createRevisionAgent(
  params: RevisionAgentParams,
): Promise<AgentHandle> {
  return getAgentProvider(params.config).createRevisionAgent(params);
}

export function createIntegrationRepairAgent(
  params: IntegrationRepairAgentParams,
): Promise<AgentHandle> {
  return getAgentProvider(params.config).createIntegrationRepairAgent(params);
}

export function sendAndObserve(
  agent: AgentHandle,
  prompt: string,
  runDirectory: string,
  events: EventLogger,
  options?: SendAndObserveOptions,
): Promise<import("./types.js").ObservedAgentRun> {
  return cursorAgentProvider.sendAndObserve(
    agent,
    prompt,
    runDirectory,
    events,
    options,
  );
}

export function disposeAgent(agent: AgentHandle): Promise<void> {
  return cursorAgentProvider.disposeAgent(agent);
}

export type {
  AgentHandle,
  CapturedGitResult,
  CursorCancelOutcome,
  ObservedAgentRun,
  SendAndObserveOptions,
} from "./types.js";
