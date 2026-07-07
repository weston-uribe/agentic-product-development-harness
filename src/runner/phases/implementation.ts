import { mkdir, writeFile } from "node:fs/promises";
import {
  DEFAULT_IMPLEMENTATION_TIMEOUT_SECONDS,
  IMPLEMENTATION_PROMPT_VERSION,
  MILESTONE,
} from "../../config/defaults.js";
import { getTransitionalStatus } from "../../config/status-names.js";
import { emptyMergeManifestFields } from "../../artifacts/manifest-fields.js";
import { writeManifest } from "../../artifacts/manifest.js";
import { writeRunSummary } from "../../artifacts/summary.js";
import {
  getImplementationPromptPath,
  getImplementationResultPath,
  getIssueSnapshotAfterPath,
  getPlanningCommentLoadedPath,
  getPrMetadataPath,
} from "../../artifacts/paths.js";
import { writeCommentsArtifact } from "../../linear/comments.js";
import { fetchLinearIssue } from "../../linear/client.js";
import { findLatestPlanningComment } from "../../linear/planning-comment.js";
import {
  createLinearClient,
  listIssueComments,
  postErrorComment,
  postImplementationComment,
  postPhaseStartCommentIfNeeded,
  transitionIssueStatus,
} from "../../linear/writer.js";
import { createImplementationCloudAgent } from "../../cursor/agent-factory.js";
import { sendAndObserve } from "../../cursor/run-observer.js";
import { resolveModelId } from "../../cursor/model.js";
import { buildBranchName } from "../../prompts/branch-name.js";
import { buildImplementationPrompt } from "../../prompts/builder.js";
import { ImplementationError } from "../errors.js";
import { runPreflight } from "../preflight.js";
import {
  assertImplementationEligibleStatus,
  checkImplementationIdempotency,
  isNarrowImplementationIssue,
} from "../idempotency.js";
import type { EventLogger } from "../../artifacts/events.js";
import type {
  ErrorClassification,
  FinalOutcome,
  RunManifest,
} from "../../types/run.js";
import type { CursorCancelOutcome } from "../../cursor/run-cleanup.js";
import type { ParsedIssue } from "../../types/parsed-issue.js";
import type { ResolvedTarget } from "../../resolver/target-repo.js";

export interface ImplementationPhaseOptions {
  issueKey: string;
  configPath: string;
  force?: boolean;
}

export interface ImplementationPhaseResult {
  manifest: RunManifest;
  runDirectory: string;
  exitCode: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ImplementationError(
      name === "LINEAR_API_KEY" ? "linear_auth_failure" : "cursor_api_failure",
      `${name} is required for live implementation runs`,
    );
  }
  return value;
}

async function writeErrorArtifact(
  runDirectory: string,
  message: string,
  errorClassification: ErrorClassification,
): Promise<void> {
  await mkdir(`${runDirectory}/errors`, { recursive: true });
  await writeFile(
    `${runDirectory}/errors/error.json`,
    `${JSON.stringify({ message, errorClassification }, null, 2)}\n`,
    "utf8",
  );
}

async function writeFinalManifest(
  manifest: RunManifest,
  runDirectory: string,
  parsed: ParsedIssue,
  resolved: ResolvedTarget | null,
  events: EventLogger | null,
  finalOutcome: FinalOutcome,
  errorClassification: ErrorClassification,
  cursorCleanup: CursorCancelOutcome | null = null,
): Promise<ImplementationPhaseResult> {
  if (runDirectory) {
    await writeManifest(runDirectory, manifest);
    await writeRunSummary(runDirectory, manifest, parsed, resolved, {
      cursorCleanup,
    });
    await events?.log("run_finished", finalOutcome === "success" ? "info" : "error", {
      finalOutcome,
      errorClassification,
    });
  }

  const exitCode =
    finalOutcome === "success" || finalOutcome === "duplicate"
      ? 0
      : errorClassification &&
          [
            "ambiguous_issue",
            "missing_target_repo",
            "unknown_repo_denied",
            "wrong_status",
            "missing_planning_comment",
          ].includes(errorClassification)
        ? 2
        : 3;

  return { manifest, runDirectory, exitCode };
}

export async function executeImplementationPhase(
  options: ImplementationPhaseOptions,
): Promise<ImplementationPhaseResult> {
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
      previousHandoffRunId: null,
      pmFeedbackCommentId: null,
      ...emptyMergeManifestFields(),
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
  let branch: string | null = null;
  let prUrl: string | null = null;
  let validationSummary: string | null = null;
  let enteredBuilding = false;
  let cursorCleanup: CursorCancelOutcome | null = null;
  const model = resolveModelId(config);
  const commentsWritten: string[] = [];
  const branchName = buildBranchName(issue.identifier, issue.title, config);

  const footerBase = {
    orchestratorMarker: config.orchestratorMarker,
    phase: "implementation",
    runId,
    model,
    promptVersion: IMPLEMENTATION_PROMPT_VERSION,
    targetRepo: resolved.targetRepo,
  };

  const client = createLinearClient(linearApiKey);

  try {
    try {
      assertImplementationEligibleStatus(config, issue, Boolean(options.force));
    } catch (error) {
      throw new ImplementationError(
        "wrong_status",
        error instanceof Error ? error.message : String(error),
      );
    }

    const comments = await listIssueComments(client, issue.id);
    const idempotency = checkImplementationIdempotency(
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
        promptVersion: IMPLEMENTATION_PROMPT_VERSION,
        cursorAgentId,
        cursorRunId,
        branch,
        prUrl,
        previewUrl: null,
        validationSummary,
        changedFiles: null,
        checkSummary: null,
        previousImplementationRunId: null,
      previousHandoffRunId: null,
      pmFeedbackCommentId: null,
        ...emptyMergeManifestFields(),
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

    const planningComment = findLatestPlanningComment(
      comments,
      config.orchestratorMarker,
    );
    if (!planningComment && !isNarrowImplementationIssue(parsed)) {
      throw new ImplementationError(
        "missing_planning_comment",
        "No durable planning comment found for a broad implementation issue",
      );
    }

    if (planningComment) {
      await mkdir(`${runDirectory}/linear`, { recursive: true });
      await writeFile(
        getPlanningCommentLoadedPath(runDirectory),
        `${planningComment.body}\n`,
        "utf8",
      );
      await events.log("planning_comment_loaded", "info", {
        commentId: planningComment.id,
      });
    }

    const buildingStatus = getTransitionalStatus(config, "buildingInProgress");
    await transitionIssueStatus(client, issue, buildingStatus);
    enteredBuilding = true;
    linearStatusAfter = buildingStatus;
    await events.log("linear_status_changed", "info", {
      from: linearStatusBefore,
      to: buildingStatus,
    });

    const repoConfig = config.repos.find((repo) => repo.id === resolved.repoConfigId);
    const validationCommands = repoConfig?.validation?.commands ?? [];
    const { prompt, promptVersion } = await buildImplementationPrompt({
      issue,
      parsed,
      resolved,
      runId,
      branchName,
      planningCommentBody: planningComment?.body ?? null,
      validationCommands,
    });

    await mkdir(`${runDirectory}/prompts`, { recursive: true });
    await writeFile(getImplementationPromptPath(runDirectory), `${prompt}\n`, "utf8");

    await using agent = await createImplementationCloudAgent({
      apiKey: cursorApiKey,
      config,
      targetRepo: resolved.targetRepo,
      baseBranch: resolved.baseBranch,
    });

    const timeoutMs =
      (config.implementation?.timeoutSeconds ??
        DEFAULT_IMPLEMENTATION_TIMEOUT_SECONDS) * 1000;

    const abortController = new AbortController();
    let timeoutError: ImplementationError | null = null;
    const timeoutId = setTimeout(() => {
      timeoutError = new ImplementationError(
        "cursor_run_timeout",
        `Cursor implementation run exceeded ${timeoutMs / 1000}s`,
      );
      abortController.abort(timeoutError);
    }, timeoutMs);

    let observed;
    try {
      observed = await sendAndObserve(agent, prompt, runDirectory, events, {
        phase: "implementation",
        targetRepo: resolved.targetRepo,
        abortSignal: abortController.signal,
        apiKey: cursorApiKey,
        onAgentCreated: async ({ agentId, runId: cursorRunId }) => {
          const commentId = await postPhaseStartCommentIfNeeded(client, issue.id, {
            orchestratorMarker: config.orchestratorMarker,
            phase: "implementation_start",
            runId,
            issueKey: issue.identifier,
            targetRepo: resolved.targetRepo,
            model,
            promptVersion: IMPLEMENTATION_PROMPT_VERSION,
            branch: branchName,
            cursorAgentId: agentId,
            cursorRunId,
          });
          if (commentId) {
            await events.log("phase_start_comment_posted", "info", {
              phase: "implementation_start",
              commentId,
            });
            await events.log("linear_comment_posted", "info", {
              phase: "implementation_start",
              commentId,
            });
          }
        },
      });
    } catch (error) {
      if (abortController.signal.aborted && timeoutError) {
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    cursorCleanup = observed.cancelOutcome;

    cursorAgentId = observed.agentId;
    cursorRunId = observed.runId;
    branch = observed.gitResult?.branch ?? null;
    prUrl = observed.gitResult?.prUrl ?? null;
    validationSummary = observed.assistantText;

    await mkdir(`${runDirectory}/outputs`, { recursive: true });
    await writeFile(
      getImplementationResultPath(runDirectory),
      `${observed.assistantText}\n`,
      "utf8",
    );

    await mkdir(`${runDirectory}/github`, { recursive: true });
    await writeFile(
      getPrMetadataPath(runDirectory),
      `${JSON.stringify(
        {
          repoUrl: observed.gitResult?.repoUrl ?? resolved.targetRepo,
          branch,
          prUrl,
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await events.log("git_result_captured", "info", {
      targetRepo: resolved.targetRepo,
      branch,
      prUrl,
    });
    await events.log("pr_captured", "info", { prUrl });
    await events.log("validation_completed", "info", { validationSummary });

    const implementationCommentBody = [
      observed.assistantText,
      "",
      `Branch: ${branch}`,
      `PR: ${prUrl}`,
    ].join("\n");
    const implementationCommentId = await postImplementationComment(
      client,
      issue.id,
      implementationCommentBody,
      {
        ...footerBase,
        promptVersion,
        cursorAgentId,
        cursorRunId,
        branch: branch ?? undefined,
        prUrl: prUrl ?? undefined,
      },
    );
    commentsWritten.push(implementationCommentBody);
    await events.log("linear_comment_posted", "info", {
      phase: "implementation",
      commentId: implementationCommentId,
    });

    const prOpenStatus = getTransitionalStatus(config, "prOpen");
    await transitionIssueStatus(client, issue, prOpenStatus);
    linearStatusAfter = prOpenStatus;
    await events.log("linear_status_changed", "info", {
      from: buildingStatus,
      to: prOpenStatus,
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
    if (error instanceof ImplementationError) {
      errorClassification = error.classification;
      cursorCleanup = error.cancelOutcome;
    } else if (error instanceof Error) {
      errorClassification = "linear_write_failure";
    } else {
      errorClassification = "linear_write_failure";
    }

    const message = error instanceof Error ? error.message : String(error);
    await writeErrorArtifact(runDirectory, message, errorClassification);

    if (enteredBuilding) {
      try {
        await postErrorComment(client, issue.id, message, {
          ...footerBase,
          cursorAgentId: cursorAgentId ?? undefined,
          cursorRunId: cursorRunId ?? undefined,
          branch: branch ?? undefined,
          prUrl: prUrl ?? undefined,
        }, "implementation");
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
    promptVersion: IMPLEMENTATION_PROMPT_VERSION,
    cursorAgentId,
    cursorRunId,
    branch,
    prUrl,
    previewUrl: null,
    validationSummary,
    changedFiles: null,
    checkSummary: null,
    previousImplementationRunId: null,
    previousHandoffRunId: null,
    pmFeedbackCommentId: null,
    ...emptyMergeManifestFields(),
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
    cursorCleanup,
  );
}
