import { Agent } from "@cursor/sdk";
import type { ModelSelection, SDKAgent } from "@cursor/sdk";
import { resolveModel } from "./model.js";
import type { HarnessConfig } from "../config/types.js";

export interface PlanningAgentParams {
  apiKey: string;
  config: HarnessConfig;
  targetRepo: string;
  baseBranch: string;
}

export type ImplementationAgentParams = PlanningAgentParams;

export async function createPlanningCloudAgent(
  params: PlanningAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolveModel(params.config);
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
  const model: ModelSelection = resolveModel(params.config);
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
