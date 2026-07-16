import { Agent } from "@cursor/sdk";
import type { ModelSelection, SDKAgent } from "@cursor/sdk";

const CLOUD_AGENT_DISPOSE_TIMEOUT_MS = 10_000;

/** Best-effort agent cleanup; never blocks the harness run indefinitely. */
export async function disposeCloudAgent(agent: SDKAgent): Promise<void> {
  const dispose = agent[Symbol.asyncDispose];
  if (!dispose) {
    return;
  }

  await Promise.race([
    dispose.call(agent),
    new Promise<void>((resolve) => {
      setTimeout(resolve, CLOUD_AGENT_DISPOSE_TIMEOUT_MS);
    }),
  ]);
}
import {
  resolveBuilderModel,
  resolvePlannerModel,
} from "./model.js";
import type { HarnessConfig } from "../config/types.js";

export interface PlanningAgentParams {
  apiKey: string;
  config: HarnessConfig;
  targetRepo: string;
  baseBranch: string;
}

export type ImplementationAgentParams = PlanningAgentParams;

export interface RevisionAgentParams {
  apiKey: string;
  config: HarnessConfig;
  targetRepo: string;
  branch: string;
  prUrl: string;
}

export type IntegrationRepairAgentParams = RevisionAgentParams;

export async function createPlanningCloudAgent(
  params: PlanningAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolvePlannerModel(params.config);
  return Agent.create({
    apiKey: params.apiKey,
    model,
    mode: "plan",
    cloud: {
      repos: [
        {
          url: params.targetRepo,
          startingRef: params.baseBranch,
        },
      ],
      autoCreatePR: false,
      skipReviewerRequest: true,
    },
  });
}

export async function createImplementationCloudAgent(
  params: ImplementationAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolveBuilderModel(params.config);
  return Agent.create({
    apiKey: params.apiKey,
    model,
    mode: "agent",
    cloud: {
      repos: [
        {
          url: params.targetRepo,
          startingRef: params.baseBranch,
        },
      ],
      autoCreatePR: true,
      skipReviewerRequest: true,
    },
  });
}

export async function createRevisionCloudAgent(
  params: RevisionAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolveBuilderModel(params.config);
  return Agent.create({
    apiKey: params.apiKey,
    model,
    mode: "agent",
    cloud: {
      repos: [
        {
          url: params.targetRepo,
          startingRef: params.branch,
          prUrl: params.prUrl,
        },
      ],
      autoCreatePR: false,
      skipReviewerRequest: true,
    },
  });
}

export async function createIntegrationRepairCloudAgent(
  params: IntegrationRepairAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolveBuilderModel(params.config);
  return Agent.create({
    apiKey: params.apiKey,
    model,
    mode: "agent",
    cloud: {
      repos: [
        {
          url: params.targetRepo,
          startingRef: params.branch,
          prUrl: params.prUrl,
        },
      ],
      autoCreatePR: false,
      skipReviewerRequest: true,
    },
  });
}

export interface ResumeBuilderCloudAgentParams {
  apiKey: string;
  agentId: string;
  events?: import("../artifacts/events.js").EventLogger;
}

export async function resumeBuilderCloudAgent(
  params: ResumeBuilderCloudAgentParams,
): Promise<SDKAgent> {
  const info = await Agent.get(params.agentId, { apiKey: params.apiKey });
  if (info.archived) {
    await Agent.unarchive(params.agentId, { apiKey: params.apiKey });
    await params.events?.log("builder_thread_unarchived", "info", {
      agentId: params.agentId,
    });
  }
  return Agent.resume(params.agentId, { apiKey: params.apiKey });
}
