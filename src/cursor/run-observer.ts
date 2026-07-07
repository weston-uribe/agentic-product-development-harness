import { mkdir, writeFile } from "node:fs/promises";
import type { SDKAgent, RunResult } from "@cursor/sdk";
import { CursorAgentError } from "@cursor/sdk";
import type { EventLogger } from "../artifacts/events.js";
import { getCursorRunResultPath } from "../artifacts/paths.js";
import { classifyCursorError, classifyRunResultStatus } from "./errors.js";
import { PlanningError } from "../runner/errors.js";

export interface ObservedRunResult {
  agentId: string;
  runId: string;
  result: RunResult;
  assistantText: string;
}

export async function sendAndObserve(
  agent: SDKAgent,
  prompt: string,
  runDirectory: string,
  events: EventLogger,
): Promise<ObservedRunResult> {
  const agentId = agent.agentId;
  let run;
  try {
    run = await agent.send(prompt);
  } catch (error) {
    const classification = classifyCursorError(error);
    throw new PlanningError(
      classification ?? "cursor_api_failure",
      error instanceof Error ? error.message : String(error),
    );
  }

  await events.log("cursor_agent_created", "info", { agentId, runId: run.id });

  try {
    for await (const event of run.stream()) {
      await events.log("cursor_event", "info", {
        type: event.type,
      });
    }
  } catch {
    // Streaming is best-effort; wait() is authoritative.
  }

  let result: RunResult;
  try {
    result = await run.wait();
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new PlanningError("cursor_api_failure", error.message);
    }
    throw error;
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
    throw new PlanningError(
      failureClass,
      result.error?.message ?? `Cursor run ended with status ${result.status}`,
    );
  }

  const assistantText = result.result?.trim() ?? "";
  if (!assistantText) {
    throw new PlanningError(
      "cursor_run_failed",
      "Cursor run finished without assistant text",
    );
  }

  const gitBranches = result.git?.branches ?? [];
  const hasBranchOrPr = gitBranches.some((b) => b.branch || b.prUrl);
  if (hasBranchOrPr) {
    throw new PlanningError(
      "agent_policy_violation",
      "Planning agent created a branch or PR despite read-only constraints",
    );
  }

  return {
    agentId,
    runId: result.id,
    result,
    assistantText,
  };
}
