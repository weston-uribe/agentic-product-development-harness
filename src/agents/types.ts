import type { HarnessConfig } from "../config/types.js";
import type { EventLogger } from "../artifacts/events.js";
import type { LinearCommentRecord } from "../linear/writer.js";
import type {
  BuilderThreadResolution,
  BuilderThreadSourcePhase,
} from "../runner/builder-thread-types.js";

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
  requestId?: string;
  assistantText: string;
  gitResult: CapturedGitResult | null;
  cancelOutcome: CursorCancelOutcome | null;
  /** Allowlisted Cursor completion fields for evaluation (optional). */
  status?: string;
  durationMs?: number | null;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
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

export interface AgentModelSelection {
  id: string;
}

export interface SendAndObserveOptions {
  phase?: AgentObservePhase;
  targetRepo?: string;
  expectedBranch?: string;
  expectedPrUrl?: string;
  abortSignal?: AbortSignal;
  apiKey?: string;
  pollIntervalMs?: number;
  model?: AgentModelSelection;
  mode?: "agent" | "plan";
  idempotencyKey?: string;
  onAgentCreated?: (details: { agentId: string; runId: string }) => Promise<void>;
  onBeforeSend?: (details: { agentId: string }) => Promise<void>;
}

export interface AcquireBuilderAgentParams {
  apiKey: string;
  config: HarnessConfig;
  phase: BuilderThreadSourcePhase;
  context: {
    issueKey: string;
    harnessRunId: string;
    targetRepo: string;
    baseBranch: string;
    branch?: string;
    prUrl?: string;
    idempotencyKey: string;
    comments: LinearCommentRecord[];
    orchestratorMarker: string;
    previousImplementationRunId?: string;
    previousRevisionRunId?: string;
  };
  events: EventLogger;
}

export interface AcquiredBuilderAgent {
  agent: AgentHandle;
  continuity: BuilderThreadResolution;
}

export interface AgentProvider {
  readonly id: "cursor";

  resolveModelId(config: HarnessConfig): string;

  createPlanningAgent(params: PlanningAgentParams): Promise<AgentHandle>;
  createImplementationAgent(params: ImplementationAgentParams): Promise<AgentHandle>;
  acquireBuilderAgent(params: AcquireBuilderAgentParams): Promise<AcquiredBuilderAgent>;

  sendAndObserve(
    agent: AgentHandle,
    prompt: string,
    runDirectory: string,
    events: EventLogger,
    options?: SendAndObserveOptions,
  ): Promise<ObservedAgentRun>;

  disposeAgent(agent: AgentHandle): Promise<void>;
}
