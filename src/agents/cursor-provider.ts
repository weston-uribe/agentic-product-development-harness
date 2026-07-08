import {
  createImplementationCloudAgent,
  createIntegrationRepairCloudAgent,
  createPlanningCloudAgent,
  createRevisionCloudAgent,
  disposeCloudAgent,
} from "../cursor/agent-factory.js";
import { resolveModelId as cursorResolveModelId } from "../cursor/model.js";
import { sendAndObserve as cursorSendAndObserve } from "../cursor/run-observer.js";
import type {
  AgentHandle,
  AgentProvider,
  ImplementationAgentParams,
  IntegrationRepairAgentParams,
  ObservedAgentRun,
  PlanningAgentParams,
  RevisionAgentParams,
  SendAndObserveOptions,
} from "./types.js";
import type { HarnessConfig } from "../config/types.js";
import type { EventLogger } from "../artifacts/events.js";

type CursorCloudAgent = Awaited<ReturnType<typeof createPlanningCloudAgent>>;

const cursorAgents = new WeakMap<AgentHandle, CursorCloudAgent>();

function wrapCursorAgent(agent: CursorCloudAgent): AgentHandle {
  const handle = { __brand: Symbol("AgentHandle") } as AgentHandle;
  cursorAgents.set(handle, agent);
  return handle;
}

function unwrapCursorAgent(handle: AgentHandle): CursorCloudAgent {
  const agent = cursorAgents.get(handle);
  if (!agent) {
    throw new Error("Invalid or disposed agent handle");
  }
  return agent;
}

function mapObservedRun(
  observed: Awaited<ReturnType<typeof cursorSendAndObserve>>,
): ObservedAgentRun {
  return {
    agentId: observed.agentId,
    runId: observed.runId,
    assistantText: observed.assistantText,
    gitResult: observed.gitResult,
    cancelOutcome: observed.cancelOutcome,
  };
}

export const cursorAgentProvider: AgentProvider = {
  id: "cursor",

  resolveModelId(config: HarnessConfig): string {
    return cursorResolveModelId(config);
  },

  async createPlanningAgent(params: PlanningAgentParams): Promise<AgentHandle> {
    const agent = await createPlanningCloudAgent(params);
    return wrapCursorAgent(agent);
  },

  async createImplementationAgent(
    params: ImplementationAgentParams,
  ): Promise<AgentHandle> {
    const agent = await createImplementationCloudAgent(params);
    return wrapCursorAgent(agent);
  },

  async createRevisionAgent(params: RevisionAgentParams): Promise<AgentHandle> {
    const agent = await createRevisionCloudAgent(params);
    return wrapCursorAgent(agent);
  },

  async createIntegrationRepairAgent(
    params: IntegrationRepairAgentParams,
  ): Promise<AgentHandle> {
    const agent = await createIntegrationRepairCloudAgent(params);
    return wrapCursorAgent(agent);
  },

  async sendAndObserve(
    agent: AgentHandle,
    prompt: string,
    runDirectory: string,
    events: EventLogger,
    options: SendAndObserveOptions = {},
  ): Promise<ObservedAgentRun> {
    const observed = await cursorSendAndObserve(
      unwrapCursorAgent(agent),
      prompt,
      runDirectory,
      events,
      options,
    );
    return mapObservedRun(observed);
  },

  async disposeAgent(agent: AgentHandle): Promise<void> {
    const cursorAgent = cursorAgents.get(agent);
    if (!cursorAgent) {
      return;
    }
    cursorAgents.delete(agent);
    await disposeCloudAgent(cursorAgent);
  },
};
