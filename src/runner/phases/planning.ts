import { mkdir, writeFile } from "node:fs/promises";
import {
  DEFAULT_PLANNING_TIMEOUT_SECONDS,
  MILESTONE,
} from "../../config/defaults.js";
import { getTransitionalStatus } from "../../config/status-names.js";
import { writeManifest } from "../../artifacts/manifest.js";
import { writeRunSummary } from "../../artifacts/summary.js";
import {
  getIssueSnapshotAfterPath,
  getPlanningPromptPath,
  getPlanningResultPath,
} from "../../artifacts/paths.js";
import { writeCommentsArtifact } from "../../linear/comments.js";
import { fetchLinearIssue } from "../../linear/client.js";
import {
  createLinearClient,
  listIssueComments,
  postErrorComment,
  postPlanningComment,
  transitionIssueStatus,
} from "../../linear/writer.js";
import { createPlanningCloudAgent } from "../../cursor/agent-factory.js";
import { sendAndObserve } from "../../cursor/run-observer.js";
import { resolveModelId } from "../../cursor/model.js";
import { buildPlanningPrompt } from "../../prompts/builder.js";
import { PlanningError } from "../errors.js";
import { runPreflight } from "../preflight.js";
import {
  assertPlanningEligibleStatus,
  checkPlanningIdempotency,
} from "../idempotency.js";
import type { EventLogger } from "../../artifacts/events.js";
import type {
  ErrorClassification,
  FinalOutcome,
  RunManifest,
} from "../../types/run.js";
import type { ParsedIssue } from "../../types/parsed-issue.js";
import type { ResolvedTarget } from "../../resolver/target-repo.js";

export interface PlanningPhaseOptions {
  issueKey: string;
  configPath: string;
  force?: boolean;
}

export interface PlanningPhaseResult {
  manifest: RunManifest;
  runDirectory: string;
  exitCode: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new PlanningError(
      name === "LINEAR_API_KEY" ? "linear_auth_failure" : "cursor_api_failure",
      `${name} is required for live planning runs`,
    );
  }
  return value;
}

async function writeFinalManifest(
  manifest: RunManifest,
  runDirectory: string,
  parsed: ParsedIssue,
  resolved: ResolvedTarget | null,
  events: EventLogger | null,
  finalOutcome: FinalOutcome,
  errorClassification: ErrorClassification,
): Promise<PlanningPhaseResult> {
  if (runDirectory) {
    await writeManifest(runDirectory, manifest);
    await writeRunSummary(runDirectory, manifest, parsed, resolved);
    await events?.log("run_finished", finalOutcome === "success" ? "info" : "error", {
      finalOutcome,
      errorClassification,
    });
  }

  const exitCode =
    finalOutcome === "success" || finalOutcome === "duplicate"
      ? 0
      : finalOutcome === "failed" && !errorClassification
        ? 2
        : errorClassification &&
            ["ambiguous_issue", "missing_target_repo", "unknown_repo_denied"].includes(
              errorClassification,
            )
          ? 2
          : 3;

  return { manifest, runDirectory, exitCode };
}

export async function executePlanningPhase(
  options: PlanningPhaseOptions,
): Promise<PlanningPhaseResult> {
  const linearApiKey = requireEnv("LINEAR_API_KEY");
  const cursorApiKey = requireEnv("CURSOR_API_KEY");

  const preflight = await runPreflight({
    issueKey: options.issueKey,
    configPath: options.configPath,
    linearApiKey,
  });

  if (!preflight.success) {
    const manifest: RunManifest = {
      runId: preflight.runId,
      issueKey: options.issueKey,
      phase: preflight.phase,
      phaseInferredFromStatus: preflight.phaseInferredFromStatus,
      linearStatusBefore: preflight.issue?.status ?? null,
      linearStatusAfter: preflight.issue?.status ?? null,
      targetRepo: preflight.resolved?.targetRepo ?? null,
      baseBranch: preflight.resolved?.baseBranch ?? null,
      resolutionSource: preflight.resolved?.resolutionSource ?? null,
      dryRun: false,
      finalOutcome: "failed",
      errorClassification: preflight.errorClassification,
      startedAt: preflight.startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      milestone: MILESTONE,
      promptVersion: null,
      cursorAgentId: null,
      cursorRunId: null,
      branch: null,
      prUrl: null,
      previewUrl: null,
      validationSummary: null,
      changedFiles: null,
      checkSummary: null,
      previousImplementationRunId: null,
      model: preflight.config ? resolveModelId(preflight.config) : null,
    };
    return writeFinalManifest(
      manifest,
      preflight.runDirectory,
      preflight.parsed,
      preflight.resolved,
      preflight.events,
      "failed",
      preflight.errorClassification,
    );
  }

  const {
    config,
    issue,
    parsed,
    resolved,
    runId,
    runDirectory,
    events,
    phase,
    phaseInferredFromStatus,
    startedAt,
  } = preflight.context;

  const linearStatusBefore = issue.status;
  let linearStatusAfter = issue.status;
  let finalOutcome: FinalOutcome = "failed";
  let errorClassification: ErrorClassification = null;
  let cursorAgentId: string | null = null;
  let cursorRunId: string | null = null;
  let promptVersion: string | null = null;
  const model = resolveModelId(config);
  let enteredPlanning = false;
  const commentsWritten: string[] = [];

  const footerBase = {
    orchestratorMarker: config.orchestratorMarker,
    phase: "planning",
    runId,
    model,
    promptVersion: "planning@1",
    targetRepo: resolved.targetRepo,
  };

  const client = createLinearClient(linearApiKey);

  try {
    try {
      assertPlanningEligibleStatus(config, issue, Boolean(options.force));
    } catch (error) {
      throw new PlanningError(
        "wrong_status",
        error instanceof Error ? error.message : String(error),
      );
    }

    const comments = await listIssueComments(client, issue.id);
    const idempotency = checkPlanningIdempotency(
      config,
      issue,
      comments,
      Boolean(options.force),
    );
    if (idempotency.skip) {
      await events.log("idempotency_skip", "info", { reason: idempotency.reason });
      finalOutcome = "duplicate";
      errorClassification = "duplicate_phase_completed";
      const manifest: RunManifest = {
        runId,
        issueKey: options.issueKey,
        phase,
        phaseInferredFromStatus,
        linearStatusBefore,
        linearStatusAfter,
        targetRepo: resolved.targetRepo,
        baseBranch: resolved.baseBranch,
        resolutionSource: resolved.resolutionSource,
        dryRun: false,
        finalOutcome,
        errorClassification,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        milestone: MILESTONE,
        promptVersion,
        cursorAgentId,
        cursorRunId,
        branch: null,
        prUrl: null,
        previewUrl: null,
        validationSummary: null,
        changedFiles: null,
        checkSummary: null,
        previousImplementationRunId: null,
        model,
      };
      return writeFinalManifest(
        manifest,
        runDirectory,
        parsed,
        resolved,
        events,
        finalOutcome,
        errorClassification,
      );
    }

    const planningStatus = getTransitionalStatus(config, "planningInProgress");
    await transitionIssueStatus(client, issue, planningStatus);
    enteredPlanning = true;
    linearStatusAfter = planningStatus;
    await events.log("linear_status_changed", "info", {
      from: linearStatusBefore,
      to: planningStatus,
    });

    const { prompt, promptVersion: version } = await buildPlanningPrompt(
      issue,
      parsed,
      resolved,
    );
    promptVersion = version;
    await mkdir(`${runDirectory}/prompts`, { recursive: true });
    await writeFile(getPlanningPromptPath(runDirectory), `${prompt}\n`, "utf8");

    await using agent = await createPlanningCloudAgent({
      apiKey: cursorApiKey,
      config,
      targetRepo: resolved.targetRepo,
      baseBranch: resolved.baseBranch,
    });

    const timeoutMs =
      (config.planning?.timeoutSeconds ?? DEFAULT_PLANNING_TIMEOUT_SECONDS) *
      1000;

    const observed = await Promise.race([
      sendAndObserve(agent, prompt, runDirectory, events),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new PlanningError(
              "cursor_run_timeout",
              `Cursor planning run exceeded ${timeoutMs / 1000}s`,
            ),
          );
        }, timeoutMs);
      }),
    ]);

    cursorAgentId = observed.agentId;
    cursorRunId = observed.runId;

    await mkdir(`${runDirectory}/outputs`, { recursive: true });
    await writeFile(
      getPlanningResultPath(runDirectory),
      `${observed.assistantText}\n`,
      "utf8",
    );

    const planningComment = await postPlanningComment(
      client,
      issue.id,
      observed.assistantText,
      {
        ...footerBase,
        promptVersion: version,
        cursorAgentId,
        cursorRunId,
      },
    );
    commentsWritten.push(observed.assistantText);
    await events.log("linear_comment_posted", "info", {
      phase: "planning",
      commentId: planningComment,
    });

    const readyForBuild = getTransitionalStatus(config, "readyForBuild");
    await transitionIssueStatus(client, issue, readyForBuild);
    linearStatusAfter = readyForBuild;
    await events.log("linear_status_changed", "info", {
      from: planningStatus,
      to: readyForBuild,
    });

    const afterIssue = await fetchLinearIssue(options.issueKey, linearApiKey);
    await writeFile(
      getIssueSnapshotAfterPath(runDirectory),
      `${JSON.stringify(afterIssue, null, 2)}\n`,
      "utf8",
    );

    if (commentsWritten.length > 0) {
      await writeCommentsArtifact(runDirectory, commentsWritten);
    }

    finalOutcome = "success";
    errorClassification = null;
  } catch (error) {
    if (error instanceof PlanningError) {
      errorClassification = error.classification;
    } else if (error instanceof Error) {
      errorClassification = "linear_write_failure";
    } else {
      errorClassification = "linear_write_failure";
    }

    if (enteredPlanning) {
      try {
        await postErrorComment(
          client,
          issue.id,
          error instanceof Error ? error.message : String(error),
          {
            ...footerBase,
            promptVersion: promptVersion ?? "planning@1",
            cursorAgentId: cursorAgentId ?? undefined,
            cursorRunId: cursorRunId ?? undefined,
          },
        );
        const blocked = getTransitionalStatus(config, "blocked");
        await transitionIssueStatus(client, issue, blocked);
        linearStatusAfter = blocked;
        await events.log("linear_status_changed", "info", {
          to: blocked,
          reason: "failure",
        });
      } catch {
        // Best-effort blocker update.
      }
    }
  }

  const manifest: RunManifest = {
    runId,
    issueKey: options.issueKey,
    phase,
    phaseInferredFromStatus,
    linearStatusBefore,
    linearStatusAfter,
    targetRepo: resolved.targetRepo,
    baseBranch: resolved.baseBranch,
    resolutionSource: resolved.resolutionSource,
    dryRun: false,
    finalOutcome,
    errorClassification,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    milestone: MILESTONE,
    promptVersion,
    cursorAgentId,
    cursorRunId,
    branch: null,
    prUrl: null,
    previewUrl: null,
    validationSummary: null,
    changedFiles: null,
    checkSummary: null,
    previousImplementationRunId: null,
    model,
  };

  return writeFinalManifest(
    manifest,
    runDirectory,
    parsed,
    resolved,
    events,
    finalOutcome,
    errorClassification,
  );
}
