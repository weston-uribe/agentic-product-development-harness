import { mkdir, writeFile } from "node:fs/promises";
import type { SDKAgent, Run, RunResult } from "@cursor/sdk";
import { CursorAgentError } from "@cursor/sdk";
import type { EventLogger } from "../artifacts/events.js";
import { getCursorRunResultPath } from "../artifacts/paths.js";
import { classifyCursorError, classifyRunResultStatus } from "./errors.js";
import { extractTargetRepoGitResult, type CapturedGitResult } from "./git-result.js";
import { cancelCursorRun, type CursorCancelOutcome } from "./run-cleanup.js";
import { ImplementationError, PlanningError, PhaseError } from "../runner/errors.js";

export type ObservePhase = "planning" | "implementation";

export interface ObservedRunResult {
  agentId: string;
  runId: string;
  result: RunResult;
  assistantText: string;
  gitResult: CapturedGitResult | null;
  cancelOutcome: CursorCancelOutcome | null;
}

export interface SendAndObserveOptions {
  phase?: ObservePhase;
  targetRepo?: string;
  abortSignal?: AbortSignal;
}

function makePhaseError(
  phase: ObservePhase,
  classification: NonNullable<import("../types/run.js").ErrorClassification>,
  message: string,
  cancelOutcome: CursorCancelOutcome | null = null,
): PhaseError {
  return phase === "implementation"
    ? new ImplementationError(classification, message, cancelOutcome)
    : new PlanningError(classification, message, cancelOutcome);
}

async function abortRun(
  phase: ObservePhase,
  abortSignal: AbortSignal,
  ensureCancelled: () => Promise<CursorCancelOutcome>,
): Promise<never> {
  const cancelOutcome = await ensureCancelled();
  const reason = abortSignal.reason;
  if (reason instanceof PhaseError) {
    throw makePhaseError(
      phase,
      reason.classification ?? "cursor_run_timeout",
      reason.message,
      cancelOutcome,
    );
  }

  throw makePhaseError(
    phase,
    "cursor_run_timeout",
    reason instanceof Error ? reason.message : "Cursor run aborted",
    cancelOutcome,
  );
}

function attachAbortHandler(
  abortSignal: AbortSignal | undefined,
  ensureCancelled: () => Promise<CursorCancelOutcome>,
): () => void {
  if (!abortSignal) {
    return () => undefined;
  }

  const onAbort = () => {
    void ensureCancelled();
  };

  abortSignal.addEventListener("abort", onAbort, { once: true });
  return () => abortSignal.removeEventListener("abort", onAbort);
}

export async function sendAndObserve(
  agent: SDKAgent,
  prompt: string,
  runDirectory: string,
  events: EventLogger,
  options: SendAndObserveOptions = {},
): Promise<ObservedRunResult> {
  const phase = options.phase ?? "planning";
  const agentId = agent.agentId;
  let run: Run;
  let detachAbort: (() => void) | undefined;
  let cancelOutcome: CursorCancelOutcome | null = null;
  let cancelPromise: Promise<CursorCancelOutcome> | null = null;

  const ensureCancelled = (): Promise<CursorCancelOutcome> => {
    if (cancelOutcome !== null) {
      return Promise.resolve(cancelOutcome);
    }
    if (!cancelPromise) {
      cancelPromise = cancelCursorRun(run, events).then((outcome) => {
        cancelOutcome = outcome;
        return outcome;
      });
    }
    return cancelPromise;
  };

  try {
    run = await agent.send(prompt);
  } catch (error) {
    const classification = classifyCursorError(error);
    throw makePhaseError(
      phase,
      classification ?? "cursor_api_failure",
      error instanceof Error ? error.message : String(error),
    );
  }

  await events.log("cursor_agent_created", "info", { agentId, runId: run.id });
  detachAbort = attachAbortHandler(options.abortSignal, ensureCancelled);
  if (options.abortSignal?.aborted) {
    await abortRun(phase, options.abortSignal, ensureCancelled);
  }

  try {
    for await (const event of run.stream()) {
      if (options.abortSignal?.aborted) {
        await abortRun(phase, options.abortSignal, ensureCancelled);
      }
      await events.log("cursor_event", "info", {
        type: event.type,
      });
    }
  } catch (error) {
    if (options.abortSignal?.aborted) {
      await abortRun(phase, options.abortSignal, ensureCancelled);
    }
    if (error instanceof PhaseError) {
      throw error;
    }
    // Streaming is best-effort; wait() is authoritative.
  }

  if (options.abortSignal?.aborted) {
    await abortRun(phase, options.abortSignal, ensureCancelled);
  }

  let result: RunResult;
  try {
    result = await run.wait();
  } catch (error) {
    if (options.abortSignal?.aborted) {
      await abortRun(phase, options.abortSignal, ensureCancelled);
    }
    if (error instanceof CursorAgentError) {
      throw makePhaseError(phase, "cursor_api_failure", error.message);
    }
    throw error;
  } finally {
    detachAbort?.();
  }

  if (options.abortSignal?.aborted) {
    await abortRun(phase, options.abortSignal, ensureCancelled);
  }

  await mkdir(`${runDirectory}/cursor`, { recursive: true });
  await writeFile(
    getCursorRunResultPath(runDirectory),
    `${JSON.stringify(
      {
        id: result.id,
        status: result.status,
        durationMs: result.durationMs,
        model: result.model,
        git: result.git,
        error: result.error,
        usage: result.usage,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await events.log("cursor_run_finished", "info", {
    runId: result.id,
    status: result.status,
    durationMs: result.durationMs,
  });

  const failureClass = classifyRunResultStatus(result.status);
  if (failureClass) {
    throw makePhaseError(
      phase,
      failureClass,
      result.error?.message ?? `Cursor run ended with status ${result.status}`,
    );
  }

  const assistantText = result.result?.trim() ?? "";
  if (!assistantText) {
    throw makePhaseError(
      phase,
      "cursor_run_failed",
      "Cursor run finished without assistant text",
    );
  }

  const gitBranches = result.git?.branches ?? [];
  const hasBranchOrPr = gitBranches.some((b) => b.branch || b.prUrl);
  if (phase === "planning" && hasBranchOrPr) {
    throw new PlanningError(
      "agent_policy_violation",
      "Planning agent created a branch or PR despite read-only constraints",
    );
  }

  const gitResult =
    phase === "implementation"
      ? extractTargetRepoGitResult(result.git, options.targetRepo ?? "")
      : null;

  return {
    agentId,
    runId: result.id,
    result,
    assistantText,
    gitResult,
    cancelOutcome,
  };
}
