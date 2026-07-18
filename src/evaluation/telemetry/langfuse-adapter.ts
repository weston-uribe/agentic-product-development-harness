import type { NestedObservationHandle, PhaseTraceHandle } from "../types.js";
import { allowsLangfuseContentProjection } from "./profiles.js";
import type { EvaluationCaptureProfile } from "../types.js";
import { toolObservationName } from "./tool-classify.js";
import type { AgentTelemetryEvent } from "./types.js";
import { boundRedactedContent } from "./redact.js";
import { MAX_LANGFUSE_CONTENT_CHARS } from "./bounds.js";

/**
 * Forward canonical telemetry events into Langfuse nested observations.
 * Content bodies only when capture profile is content-v1.
 */
export function createLangfuseTelemetryForwarder(params: {
  phaseTrace: PhaseTraceHandle | null | undefined;
  agentObservation: NestedObservationHandle | null | undefined;
  captureProfile: EvaluationCaptureProfile;
}): (event: AgentTelemetryEvent) => void {
  const toolHandles = new Map<string, NestedObservationHandle>();
  let generationStarted = false;
  let generationHandle: NestedObservationHandle | null = null;

  return (event: AgentTelemetryEvent) => {
    const root = params.phaseTrace;
    const agent = params.agentObservation;
    if (!root || !agent) return;

    const allowContent = allowsLangfuseContentProjection(params.captureProfile);

    try {
      if (event.kind === "tool_call_started") {
        const callId = String(event.payload.callId ?? "");
        const toolName = String(event.payload.toolName ?? "unknown");
        if (!callId || toolHandles.has(callId)) return;
        const handle = agent.startChild(toolObservationName(toolName), "tool");
        handle.update({
          metadata: {
            callId,
            toolName,
            status: "started",
            mutationClass: event.payload.mutationClass,
            filePath: event.payload.filePath,
          },
        });
        toolHandles.set(callId, handle);
        return;
      }

      if (event.kind === "tool_call_finished" || event.kind === "tool_result") {
        const callId = String(event.payload.callId ?? "");
        const handle = toolHandles.get(callId);
        if (!handle) return;
        if (event.kind === "tool_call_finished") {
          handle.end({
            metadata: {
              callId,
              status: event.payload.status,
              durationMs: event.payload.durationMs,
              exitCode: event.payload.exitCode,
              stdoutByteCount: event.payload.stdoutByteCount,
              stderrByteCount: event.payload.stderrByteCount,
              mutationClass: event.payload.mutationClass,
            },
            ...(allowContent && event.payload.resultSummary
              ? { output: String(event.payload.resultSummary) }
              : {}),
          });
          toolHandles.delete(callId);
        }
        return;
      }

      if (event.kind === "model_usage" || event.kind === "agent_run_finished") {
        const usage = event.payload.usage as
          | {
              inputTokens?: number;
              outputTokens?: number;
              totalTokens?: number;
              cacheReadTokens?: number;
              cacheWriteTokens?: number;
              reasoningTokens?: number;
              cost?: { costSource?: string };
            }
          | undefined;
        const modelId =
          typeof event.payload.modelId === "string"
            ? event.payload.modelId
            : undefined;

        if (!generationStarted && agent) {
          generationHandle = agent.startChild(
            "p-dev.cursor.aggregate-usage",
            "generation",
          );
          generationStarted = true;
        }
        if (generationHandle) {
          const usageDetails: Record<string, number> = {};
          if (typeof usage?.inputTokens === "number") {
            usageDetails.input = usage.inputTokens;
          }
          if (typeof usage?.outputTokens === "number") {
            usageDetails.output = usage.outputTokens;
          }
          if (typeof usage?.totalTokens === "number") {
            usageDetails.total = usage.totalTokens;
          }
          if (typeof usage?.cacheReadTokens === "number") {
            usageDetails.cache_read = usage.cacheReadTokens;
          }
          if (typeof usage?.cacheWriteTokens === "number") {
            usageDetails.cache_write = usage.cacheWriteTokens;
          }
          if (typeof usage?.reasoningTokens === "number") {
            usageDetails.reasoning = usage.reasoningTokens;
          }
          generationHandle.update({
            model: modelId,
            usageDetails:
              Object.keys(usageDetails).length > 0 ? usageDetails : undefined,
            metadata: {
              usageAggregation: "cursor_run",
              costSource: usage?.cost?.costSource ?? "unavailable",
            },
          });
          if (event.kind === "agent_run_finished") {
            generationHandle.end({
              model: modelId,
              usageDetails:
                Object.keys(usageDetails).length > 0 ? usageDetails : undefined,
              metadata: {
                usageAggregation: "cursor_run",
                costSource: usage?.cost?.costSource ?? "unavailable",
              },
            });
            generationHandle = null;
          }
        }
      }

      if (event.kind === "pm_feedback" && allowContent) {
        const content =
          typeof event.payload.contentPreview === "string"
            ? event.payload.contentPreview
            : undefined;
        if (content) {
          root.setIO?.(
            { pmFeedback: boundRedactedContent(content, MAX_LANGFUSE_CONTENT_CHARS).text },
            undefined,
          );
        }
      }
    } catch {
      // Non-authoritative
    }
  };
}
