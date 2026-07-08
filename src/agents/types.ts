import type { HarnessConfig } from "../config/types.js";
import type { EventLogger } from "../artifacts/events.js";

export type AgentObservePhase =
  | "planning"
  | "implementation"
  | "revision"
  | "integration_repair";

export type CursorCancelOutcome =
  | "cancelled"
  | "cancel_unavailable"
  | "cancel_failed";

export interface CapturedGitResult {
  repoUrl: string;
  branch: string;
  prUrl: string;
}

export interface ObservedAgentRun {
  agentId: string;
  runId: string;
  assistantText: string;
  gitResult: CapturedGitResult | null;
  cancelOutcome: CursorCancelOutcome | null;
}

export interface AgentHandle {
  readonly __brand: unique symbol;
}

export interface PlanningAgentParams {
  apiKey: string;
  config: HarnessConfig;
  targetRepo: string;
  baseBranch: string;
}

export type ImplementationAgentParams = PlanningAgentParams;

export interface BranchAgentParams {
  apiKey: string;
  config: HarnessConfig;
  targetRepo: string;
  branch: string;
  prUrl: string;
}

export type RevisionAgentParams = BranchAgentParams;
export type IntegrationRepairAgentParams = BranchAgentParams;

export interface SendAndObserveOptions {
  phase?: AgentObservePhase;
  targetRepo?: string;
  expectedBranch?: string;
  expectedPrUrl?: string;
  abortSignal?: AbortSignal;
  apiKey?: string;
  pollIntervalMs?: number;
  onAgentCreated?: (details: { agentId: string; runId: string }) => Promise<void>;
}

export interface AgentProvider {
  readonly id: "cursor";

  resolveModelId(config: HarnessConfig): string;

  createPlanningAgent(params: PlanningAgentParams): Promise<AgentHandle>;
  createImplementationAgent(params: ImplementationAgentParams): Promise<AgentHandle>;
  createRevisionAgent(params: RevisionAgentParams): Promise<AgentHandle>;
  createIntegrationRepairAgent(
    params: IntegrationRepairAgentParams,
  ): Promise<AgentHandle>;

  sendAndObserve(
    agent: AgentHandle,
    prompt: string,
    runDirectory: string,
    events: EventLogger,
    options?: SendAndObserveOptions,
  ): Promise<ObservedAgentRun>;

  disposeAgent(agent: AgentHandle): Promise<void>;
}
