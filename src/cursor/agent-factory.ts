import { Agent } from "@cursor/sdk";
import type { ModelSelection, SDKAgent } from "@cursor/sdk";
import {
  assertModelSelectionAccepted,
  classifyProviderModelError,
  getParamValue,
} from "../models/index.js";
import {
  trackModelAgentRunStarted,
} from "../observability/model-analytics.js";
import {
  resolveBuilderModel,
  resolveModelResolutionForRole,
  resolvePlanReviewerModel,
  resolvePlannerModel,
} from "./model.js";
import type { HarnessConfig } from "../config/types.js";
import type { RoleModelRole } from "../config/role-models.js";

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

export type ReplacementBuilderAgentParams = RevisionAgentParams;

async function createCloudAgentWithModel(input: {
  apiKey: string;
  model: ModelSelection;
  mode: "plan" | "agent";
  config: HarnessConfig;
  role: RoleModelRole;
  cloud: {
    repos: Array<{
      url: string;
      startingRef: string;
      prUrl?: string;
    }>;
    autoCreatePR: boolean;
    skipReviewerRequest: boolean;
  };
}): Promise<SDKAgent> {
  // Fail before create when params are invalid; never silently drop Fast/Standard.
  assertModelSelectionAccepted({ selection: input.model });
  const resolution = resolveModelResolutionForRole(input.config, input.role);
  try {
    const agent = await Agent.create({
      apiKey: input.apiKey,
      model: input.model,
      mode: input.mode,
      cloud: input.cloud,
    });
    trackModelAgentRunStarted({
      agentRole: input.role,
      baseModelId: input.model.id,
      fastEnabled: getParamValue(input.model.params, "fast") === "true",
      capabilitySource:
        resolution.capabilitySource === "cursor-live" ||
        resolution.capabilitySource === "fixture" ||
        resolution.capabilitySource === "fallback-registry"
          ? resolution.capabilitySource
          : "unknown",
      configurationSurface: "workflow",
      parameterEvidenceSource: resolution.parameterEvidenceSource,
    });
    return agent;
  } catch (error) {
    const classified = classifyProviderModelError(error, input.model);
    if (classified) {
      throw classified;
    }
    throw error;
  }
}

export async function createPlanningCloudAgent(
  params: PlanningAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolvePlannerModel(params.config);
  return createCloudAgentWithModel({
    apiKey: params.apiKey,
    model,
    mode: "plan",
    config: params.config,
    role: "planner",
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

export type PlanReviewAgentParams = PlanningAgentParams;

/**
 * Fresh Plan Reviewer agent — must not reuse the planner conversation.
 * Read-only plan mode; never auto-creates a PR.
 */
export async function createPlanReviewCloudAgent(
  params: PlanReviewAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolvePlanReviewerModel(params.config);
  return createCloudAgentWithModel({
    apiKey: params.apiKey,
    model,
    mode: "plan",
    config: params.config,
    role: "planReviewer",
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
  return createCloudAgentWithModel({
    apiKey: params.apiKey,
    model,
    mode: "agent",
    config: params.config,
    role: "builder",
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

export async function createReplacementBuilderCloudAgent(
  params: ReplacementBuilderAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolveBuilderModel(params.config);
  return createCloudAgentWithModel({
    apiKey: params.apiKey,
    model,
    mode: "agent",
    config: params.config,
    role: "builder",
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

export async function createRevisionCloudAgent(
  params: RevisionAgentParams,
): Promise<SDKAgent> {
  const model: ModelSelection = resolveBuilderModel(params.config);
  return createCloudAgentWithModel({
    apiKey: params.apiKey,
    model,
    mode: "agent",
    config: params.config,
    role: "builder",
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
  return createCloudAgentWithModel({
    apiKey: params.apiKey,
    model,
    mode: "agent",
    config: params.config,
    role: "builder",
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
