import {
  AgentNotFoundError,
  AuthenticationError,
  CursorAgentError,
  NetworkError,
  RateLimitError,
  type SDKAgent,
} from "@cursor/sdk";
import type { EventLogger } from "../artifacts/events.js";
import {
  createImplementationCloudAgent,
  resumeBuilderCloudAgent,
} from "../cursor/agent-factory.js";
import { classifyBuilderResumeError } from "../cursor/builder-resume-errors.js";
import type { HarnessConfig } from "../config/types.js";
import type { LinearCommentRecord } from "../linear/writer.js";
import { resolveBuilderThreadReference } from "./builder-thread-lineage.js";
import type {
  BuilderThreadReference,
  BuilderThreadReplacementReason,
  BuilderThreadResolution,
  BuilderThreadSourcePhase,
} from "./builder-thread-types.js";

export interface AcquireBuilderAgentContext {
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
}

export interface AcquireBuilderAgentParams {
  apiKey: string;
  config: HarnessConfig;
  phase: BuilderThreadSourcePhase;
  context: AcquireBuilderAgentContext;
  events: EventLogger;
}

export interface AcquiredBuilderAgent {
  agent: SDKAgent;
  continuity: BuilderThreadResolution;
}

export interface ReplacementBuilderContext extends AcquireBuilderAgentContext {
  replacementReason: BuilderThreadReplacementReason;
  previousAgentId?: string;
}

function wrapReference(
  reference: BuilderThreadReference,
  action: BuilderThreadResolution["action"],
  extra?: Partial<BuilderThreadResolution>,
): BuilderThreadResolution {
  return {
    reference,
    action,
    ...extra,
  };
}

async function createInitialBuilder(
  params: AcquireBuilderAgentParams,
): Promise<AcquiredBuilderAgent> {
  const { apiKey, config, context } = params;
  const agent = await createImplementationCloudAgent({
    apiKey,
    config,
    targetRepo: context.targetRepo,
    baseBranch: context.baseBranch,
  });
  const reference: BuilderThreadReference = {
    agentId: agent.agentId,
    generation: 1,
    originHarnessRunId: context.harnessRunId,
    latestHarnessRunId: context.harnessRunId,
    sourcePhase: params.phase,
    targetRepo: context.targetRepo,
    branch: context.branch,
    prUrl: context.prUrl,
    idempotencyKey: context.idempotencyKey,
  };
  await params.events.log("builder_thread_created", "info", {
    agentId: agent.agentId,
    generation: 1,
    phase: params.phase,
  });
  return {
    agent,
    continuity: wrapReference(reference, "created"),
  };
}

async function resumeExistingBuilder(
  params: AcquireBuilderAgentParams,
  prior: BuilderThreadReference,
): Promise<AcquiredBuilderAgent> {
  await params.events.log("builder_thread_resume_attempted", "info", {
    agentId: prior.agentId,
    generation: prior.generation,
    phase: params.phase,
  });
  try {
    const agent = await resumeBuilderCloudAgent({
      apiKey: params.apiKey,
      agentId: prior.agentId,
      events: params.events,
    });
    const reference: BuilderThreadReference = {
      ...prior,
      latestHarnessRunId: params.context.harnessRunId,
      sourcePhase: params.phase,
      branch: params.context.branch ?? prior.branch,
      prUrl: params.context.prUrl ?? prior.prUrl,
      idempotencyKey: params.context.idempotencyKey,
    };
    await params.events.log("builder_thread_resumed", "info", {
      agentId: agent.agentId,
      generation: reference.generation,
      phase: params.phase,
    });
    return {
      agent,
      continuity: wrapReference(reference, "resumed"),
    };
  } catch (error) {
    await params.events.log("builder_thread_resume_failed", "warn", {
      agentId: prior.agentId,
      classification: classifyBuilderResumeError(error),
    });
    throw error;
  }
}

export async function acquireBuilderAgent(
  params: AcquireBuilderAgentParams,
): Promise<AcquiredBuilderAgent> {
  const prior = resolveBuilderThreadReference({
    comments: params.context.comments,
    orchestratorMarker: params.context.orchestratorMarker,
    issueKey: params.context.issueKey,
    targetRepo: params.context.targetRepo,
    branch: params.context.branch,
    prUrl: params.context.prUrl,
    previousImplementationRunId: params.context.previousImplementationRunId,
    previousRevisionRunId: params.context.previousRevisionRunId,
  });

  if (prior) {
    await params.events.log("builder_thread_resolved", "info", {
      agentId: prior.agentId,
      generation: prior.generation,
      phase: params.phase,
    });
    try {
      return await resumeExistingBuilder(params, prior);
    } catch (error) {
      const replacementReason = classifyBuilderResumeError(error);
      if (!replacementReason) {
        throw error;
      }
      return createReplacementBuilderAgent({
        ...params,
        context: {
          ...params.context,
          replacementReason,
          previousAgentId: prior.agentId,
        },
      });
    }
  }

  if (params.phase === "implementation") {
    return createInitialBuilder(params);
  }

  await params.events.log("builder_thread_lineage_rejected", "error", {
    phase: params.phase,
    reason: "legacy_missing_lineage",
  });
  return createReplacementBuilderAgent({
    ...params,
    context: {
      ...params.context,
      replacementReason: "legacy_missing_lineage",
    },
  });
}

export async function createReplacementBuilderAgent(
  params: AcquireBuilderAgentParams & {
    context: ReplacementBuilderContext;
  },
): Promise<AcquiredBuilderAgent> {
  const { apiKey, config, context } = params;
  const priorGeneration =
    resolveBuilderThreadReference({
      comments: context.comments,
      orchestratorMarker: context.orchestratorMarker,
      issueKey: context.issueKey,
      targetRepo: context.targetRepo,
      branch: context.branch,
      prUrl: context.prUrl,
      previousImplementationRunId: context.previousImplementationRunId,
      previousRevisionRunId: context.previousRevisionRunId,
    })?.generation ?? 0;

  const agent = await createImplementationCloudAgent({
    apiKey,
    config,
    targetRepo: context.targetRepo,
    baseBranch: context.baseBranch,
  });
  const reference: BuilderThreadReference = {
    agentId: agent.agentId,
    generation: Math.max(1, priorGeneration + 1),
    originHarnessRunId: context.harnessRunId,
    latestHarnessRunId: context.harnessRunId,
    sourcePhase: params.phase,
    targetRepo: context.targetRepo,
    branch: context.branch,
    prUrl: context.prUrl,
    idempotencyKey: context.idempotencyKey,
  };
  await params.events.log("builder_thread_replacement_created", "info", {
    agentId: agent.agentId,
    generation: reference.generation,
    replacementReason: context.replacementReason,
    previousAgentId: context.previousAgentId,
  });
  return {
    agent,
    continuity: wrapReference(reference, "replaced", {
      previousAgentId: context.previousAgentId,
      replacementReason: context.replacementReason,
    }),
  };
}

export function isTransientBuilderResumeError(error: unknown): boolean {
  return (
    error instanceof AuthenticationError ||
    error instanceof NetworkError ||
    error instanceof RateLimitError ||
    (error instanceof CursorAgentError && error.isRetryable)
  );
}

export function isDefinitiveAgentLossError(
  error: unknown,
): BuilderThreadReplacementReason | null {
  if (error instanceof AgentNotFoundError) {
    return "agent_not_found";
  }
  if (error instanceof CursorAgentError) {
    if (error.code === "agent_not_found") {
      return "agent_not_found";
    }
    if (error.code === "agent_deleted") {
      return "agent_deleted";
    }
    if (error.code === "agent_inaccessible") {
      return "agent_inaccessible";
    }
  }
  return classifyBuilderResumeError(error);
}
