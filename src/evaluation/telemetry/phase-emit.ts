import { appendTelemetryEvent } from "./writer.js";
import { deriveTelemetryEventId } from "./ids.js";
import {
  AGENT_TELEMETRY_SCHEMA_VERSION,
  type AgentTelemetryEvent,
  type ArtifactRef,
  type SkillProvenanceRecord,
  type TelemetryCorrelationContext,
} from "./types.js";
import type { PromptProvenance } from "./provenance.js";

function baseEvent(
  ctx: TelemetryCorrelationContext,
  kind: AgentTelemetryEvent["kind"],
  discriminator: string,
  payload: Record<string, unknown>,
): AgentTelemetryEvent {
  return {
    schemaVersion: AGENT_TELEMETRY_SCHEMA_VERSION,
    eventId: deriveTelemetryEventId(ctx.phaseExecutionId, kind, discriminator),
    evaluationSessionId: ctx.evaluationSessionId,
    harnessRunId: ctx.harnessRunId,
    phaseExecutionId: ctx.phaseExecutionId,
    phase: ctx.phase,
    provider: ctx.provider,
    timestamp: new Date().toISOString(),
    providerTraceId: ctx.providerTraceId,
    cursorAgentId: ctx.cursorAgentId,
    cursorRunId: ctx.cursorRunId,
    cursorRequestId: ctx.cursorRequestId,
    kind,
    payload,
  };
}

export async function emitPromptProvenanceEvent(
  runDirectory: string,
  ctx: TelemetryCorrelationContext,
  provenance: PromptProvenance,
  onTelemetryEvent?: (event: AgentTelemetryEvent) => void | Promise<void>,
): Promise<void> {
  const event = baseEvent(ctx, "prompt_provenance", "prompt", {
    promptContractVersion: provenance.promptContractVersion,
    promptTemplatePath: provenance.promptTemplatePath,
    promptTemplateSha256: provenance.promptTemplateSha256,
    artifactRef: provenance.renderedPromptArtifact,
  });
  await appendTelemetryEvent(runDirectory, event);
  await onTelemetryEvent?.(event);
}

export async function emitSkillProvenanceEvent(
  runDirectory: string,
  ctx: TelemetryCorrelationContext,
  skills: {
    eligibleSkills: SkillProvenanceRecord[];
    declaredSkills: SkillProvenanceRecord[];
    observedSkills: SkillProvenanceRecord[];
  },
  onTelemetryEvent?: (event: AgentTelemetryEvent) => void | Promise<void>,
): Promise<void> {
  const event = baseEvent(ctx, "skill_provenance", "skills", {
    eligibleSkills: skills.eligibleSkills,
    declaredSkills: skills.declaredSkills,
    observedSkills: skills.observedSkills,
  });
  await appendTelemetryEvent(runDirectory, event);
  await onTelemetryEvent?.(event);
}

export async function emitPmFeedbackTelemetryEvent(
  runDirectory: string,
  ctx: TelemetryCorrelationContext,
  payload: {
    artifactRef: ArtifactRef | null;
    pmFeedbackCommentId: string;
    pmFeedbackWordCount: number;
    timeSinceHandoffMs: number | null;
    /** Bounded redacted preview for content-v1 Langfuse only; still stored as optional payload field. */
    contentPreview?: string;
  },
  onTelemetryEvent?: (event: AgentTelemetryEvent) => void | Promise<void>,
): Promise<void> {
  const event = baseEvent(ctx, "pm_feedback", payload.pmFeedbackCommentId, {
    artifactRef: payload.artifactRef,
    pmFeedbackCommentId: payload.pmFeedbackCommentId,
    pmFeedbackWordCount: payload.pmFeedbackWordCount,
    timeSinceHandoffMs: payload.timeSinceHandoffMs,
    ...(payload.contentPreview
      ? { contentPreview: payload.contentPreview }
      : {}),
  });
  await appendTelemetryEvent(runDirectory, event);
  await onTelemetryEvent?.(event);
}

export function agentObsMetadataFromObserved(observed: {
  agentId: string;
  runId: string;
  requestId?: string;
  status?: string;
  durationMs?: number | null;
  model?: { id: string } | null;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    cost?: { costSource?: string };
  } | null;
  completeness?: {
    model_present?: boolean;
    usage_present?: boolean;
    tool_events_present?: boolean;
    tool_event_completion_rate?: number | null;
    prompt_provenance_present?: boolean;
    skill_provenance_present?: boolean;
    agent_output_present?: boolean;
  };
  eventCounts?: { total?: number };
}): Record<string, unknown> {
  const usage = observed.usage;
  return {
    cursorAgentId: observed.agentId,
    cursorRunId: observed.runId,
    cursorRequestId: observed.requestId ?? null,
    cursorStatus: observed.status ?? null,
    cursorDurationMs: observed.durationMs ?? null,
    modelId: observed.model?.id ?? null,
    costSource: usage?.cost?.costSource ?? "unavailable",
    cursorUsageInputTokens: usage?.inputTokens,
    cursorUsageOutputTokens: usage?.outputTokens,
    cursorUsageTotalTokens: usage?.totalTokens,
    cursorUsageCacheReadTokens: usage?.cacheReadTokens,
    cursorUsageCacheWriteTokens: usage?.cacheWriteTokens,
    cursorUsageReasoningTokens: usage?.reasoningTokens,
    telemetryEventCount: observed.eventCounts?.total,
    usageAggregation: "cursor_run",
    ...(observed.completeness
      ? {
          telemetryCompletenessModel: observed.completeness.model_present,
          telemetryCompletenessUsage: observed.completeness.usage_present,
          telemetryCompletenessToolEvents:
            observed.completeness.tool_events_present,
          telemetryCompletenessToolCompletionRate:
            observed.completeness.tool_event_completion_rate,
          telemetryCompletenessPromptProvenance:
            observed.completeness.prompt_provenance_present,
          telemetryCompletenessSkillProvenance:
            observed.completeness.skill_provenance_present,
          telemetryCompletenessAgentOutput:
            observed.completeness.agent_output_present,
        }
      : {}),
  };
}
