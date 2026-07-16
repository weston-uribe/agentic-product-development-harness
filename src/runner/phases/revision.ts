import { mkdir, writeFile } from "node:fs/promises";
import {
  DEFAULT_PREVIEW_POLL_INTERVAL_SECONDS,
  DEFAULT_PREVIEW_POLL_TIMEOUT_SECONDS,
  DEFAULT_REVISION_TIMEOUT_SECONDS,
  MILESTONE,
  REVISION_PROMPT_VERSION,
} from "../../config/defaults.js";
import { getTransitionalStatus } from "../../config/status-names.js";
import { emptyMergeManifestFields } from "../../artifacts/manifest-fields.js";
import { writeManifest } from "../../artifacts/manifest.js";
import { writeRunSummary } from "../../artifacts/summary.js";
import {
  getGithubChecksPath,
  getGithubPrAfterPath,
  getGithubPrBeforePath,
  getHandoffCommentLoadedPath,
  getIssueSnapshotAfterPath,
  getPmFeedbackCommentLoadedPath,
  getRevisionCommentPath,
  getRevisionPromptPath,
  getRevisionResultPath,
  getVercelDeploymentPath,
} from "../../artifacts/paths.js";
import {
  buildRevisionCommentBody,
  writeCommentsArtifact,
} from "../../linear/comments.js";
import { fetchLinearIssue } from "../../linear/client.js";
import { findLatestHandoffComment } from "../../linear/handoff-comment.js";
import { findLatestPmFeedbackAfterHandoff } from "../../linear/pm-feedback-comment.js";
import { parseHarnessMarkers } from "../../linear/markers.js";
import {
  createLinearClient,
  listIssueComments,
  postErrorComment,
  postPhaseStartCommentIfNeeded,
  postRevisionComment,
  transitionIssueStatus,
} from "../../linear/writer.js";
import { GitHubClient } from "../../github/client.js";
import { assertPrBaseBranchMatches } from "../../github/base-branch.js";
import {
  classifyGitHubError,
  inspectPullRequest,
} from "../../github/pr-inspector.js";
import { parsePrUrl } from "../../github/pr-url.js";
import { pollForVercelPreview } from "../../preview/vercel-from-pr.js";
import {
  acquireBuilderAgent,
  disposeAgent,
  sendAndObserve,
  type CursorCancelOutcome,
} from "../../agents/index.js";
import { manifestModelEvidence, resolveBuilderModel } from "../../cursor/model.js";
import { normalizeRepoUrl } from "../../resolver/normalize-repo.js";
import { buildRevisionPrompt } from "../../prompts/revision-builder.js";
import { buildRevisionIdempotencyKey } from "../builder-thread-idempotency.js";
import {
  builderManifestFieldsFromResolution,
  builderMarkerEvidenceFromResolution,
} from "../builder-thread-evidence.js";
import type { BuilderThreadResolution } from "../builder-thread-types.js";
import { RevisionError } from "../errors.js";
import { runPreflight } from "../preflight.js";
import {
  assertRevisionEligibleStatus,
  checkRevisionIdempotency,
} from "../idempotency.js";
import type { EventLogger } from "../../artifacts/events.js";
import type {
  ErrorClassification,
  FinalOutcome,
  RunManifest,
} from "../../types/run.js";
import type { ParsedIssue } from "../../types/parsed-issue.js";
import type { ResolvedTarget } from "../../resolver/target-repo.js";

export interface RevisionPhaseOptions {
  issueKey: string;
  configPath: string;
  force?: boolean;
}

export interface RevisionPhaseResult {
  manifest: RunManifest;
  runDirectory: string;
  exitCode: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    const classification =
      name === "LINEAR_API_KEY"
        ? "linear_auth_failure"
        : name === "CURSOR_API_KEY"
          ? "cursor_api_failure"
          : "github_auth_failure";
    throw new RevisionError(classification, `${name} is required for live revision runs`);
  }
  return value;
}

function emptyManifestFields() {
  return {
    changedFiles: null as string[] | null,
    checkSummary: null as string | null,
    previousImplementationRunId: null as string | null,
    previousHandoffRunId: null as string | null,
    pmFeedbackCommentId: null as string | null,
    ...emptyMergeManifestFields(),
  };
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
): Promise<RevisionPhaseResult> {
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
            "linear_auth_failure",
            "cursor_api_failure",
            "github_auth_failure",
            "missing_handoff_marker",
            "missing_pm_feedback",
            "missing_branch",
            "missing_pr_url",
            "base_branch_missing",
            "wrong_pr_base_branch",
          ].includes(errorClassification)
        ? 2
        : 3;

  return { manifest, runDirectory, exitCode };
}

export async function executeRevisionPhase(
  options: RevisionPhaseOptions,
): Promise<RevisionPhaseResult> {
  let linearApiKey: string;
  let cursorApiKey: string;
  let githubToken: string;

  try {
    linearApiKey = requireEnv("LINEAR_API_KEY");
    cursorApiKey = requireEnv("CURSOR_API_KEY");
    githubToken = requireEnv("GITHUB_TOKEN");
  } catch (error) {
    if (error instanceof RevisionError) {
      const startedAt = new Date().toISOString();
      const manifest: RunManifest = {
        runId: `auth-failure-${options.issueKey}`,
        issueKey: options.issueKey,
        phase: "revision",
        phaseInferredFromStatus: null,
        linearStatusBefore: null,
        linearStatusAfter: null,
        targetRepo: null,
        baseBranch: null,
        resolutionSource: null,
        dryRun: false,
        finalOutcome: "failed",
        errorClassification: error.classification,
        startedAt,
        finishedAt: startedAt,
        milestone: MILESTONE,
        promptVersion: null,
        cursorAgentId: null,
        cursorRunId: null,
        branch: null,
        prUrl: null,
        previewUrl: null,
        validationSummary: null,
        model: null,
        ...emptyManifestFields(),
      };
      return { manifest, runDirectory: "", exitCode: 2 };
    }
    throw error;
  }

  const preflight = await runPreflight({
    issueKey: options.issueKey,
    configPath: options.configPath,
    linearApiKey,
  });

  if (!preflight.success) {
    const manifest: RunManifest = {
      runId: preflight.runId,
      issueKey: options.issueKey,
      phase: "revision",
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
      model: preflight.config
        ? manifestModelEvidence(preflight.config, "builder").model
        : null,
      modelRole: preflight.config ? "builder" : null,
      modelParams: preflight.config
        ? manifestModelEvidence(preflight.config, "builder").modelParams
        : null,
      ...emptyManifestFields(),
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
  let previewUrl: string | null = null;
  let validationSummary: string | null = null;
  let changedFiles: string[] | null = null;
  let checkSummary: string | null = null;
  let previousImplementationRunId: string | null = null;
  let previousHandoffRunId: string | null = null;
  let pmFeedbackCommentId: string | null = null;
  let enteredRevising = false;
  let cursorCleanup: CursorCancelOutcome | null = null;
  let builderContinuity: BuilderThreadResolution | null = null;
  let cursorRequestId: string | null = null;
  const builderModel = manifestModelEvidence(config, "builder");
  const model = builderModel.model;
  const commentsWritten: string[] = [];

  const footerBase = {
    orchestratorMarker: config.orchestratorMarker,
    phase: "revision",
    runId,
    model,
    promptVersion: REVISION_PROMPT_VERSION,
    targetRepo: resolved.targetRepo,
    baseBranch: resolved.baseBranch,
  };

  const client = createLinearClient(linearApiKey);
  const github = new GitHubClient({ token: githubToken });

  try {
    const comments = await listIssueComments(client, issue.id);

    const handoffComment = findLatestHandoffComment(comments, config.orchestratorMarker);
    if (!handoffComment) {
      throw new RevisionError(
        "missing_handoff_marker",
        "No durable handoff marker comment found",
      );
    }

    const pmFeedbackComment = findLatestPmFeedbackAfterHandoff(
      comments,
      handoffComment,
      config.orchestratorMarker,
    );
    if (!pmFeedbackComment) {
      throw new RevisionError(
        "missing_pm_feedback",
        "No PM feedback comment found after latest handoff marker",
      );
    }

    pmFeedbackCommentId = pmFeedbackComment.id;

    const idempotency = checkRevisionIdempotency(
      config,
      issue,
      comments,
      pmFeedbackCommentId,
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
        promptVersion: REVISION_PROMPT_VERSION,
        cursorAgentId,
        cursorRunId,
        branch,
        prUrl,
        previewUrl,
        validationSummary,
        changedFiles,
        checkSummary,
        previousImplementationRunId,
        previousHandoffRunId,
        pmFeedbackCommentId,
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

    if (idempotency.reason?.startsWith("wrong_status")) {
      throw new RevisionError("wrong_status", idempotency.reason);
    }

    try {
      assertRevisionEligibleStatus(config, issue, Boolean(options.force));
    } catch (error) {
      throw new RevisionError(
        "wrong_status",
        error instanceof Error ? error.message : String(error),
      );
    }

    const handoffMarkers = parseHarnessMarkers(handoffComment.body);
    if (!handoffMarkers.prUrl) {
      throw new RevisionError("missing_pr_url", "Handoff marker is missing pr_url");
    }

    prUrl = handoffMarkers.prUrl;
    branch = handoffMarkers.branch ?? null;
    previewUrl = handoffMarkers.previewUrl ?? null;
    previousHandoffRunId = handoffMarkers.runId ?? null;
    previousImplementationRunId = handoffMarkers.previousImplementationRunId ?? null;
    const markerTargetRepo = normalizeRepoUrl(
      handoffMarkers.targetRepo ?? resolved.targetRepo,
    );

    await mkdir(`${runDirectory}/linear`, { recursive: true });
    await writeFile(
      getHandoffCommentLoadedPath(runDirectory),
      `${handoffComment.body}\n`,
      "utf8",
    );
    await writeFile(
      getPmFeedbackCommentLoadedPath(runDirectory),
      `${pmFeedbackComment.body}\n`,
      "utf8",
    );
    await events.log("handoff_comment_loaded", "info", {
      commentId: handoffComment.id,
      previousHandoffRunId,
    });
    await events.log("pm_feedback_loaded", "info", {
      commentId: pmFeedbackComment.id,
    });

    const parsedPr = parsePrUrl(prUrl);
    if (!parsedPr) {
      throw new RevisionError("missing_pr_url", `Invalid PR URL: ${prUrl}`);
    }

    let inspection;
    try {
      inspection = await inspectPullRequest(github, parsedPr, markerTargetRepo);
    } catch (error) {
      const classification = classifyGitHubError(error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("wrong_target_repo")) {
        throw new RevisionError("wrong_target_repo", message);
      }
      if (message.includes("pr_closed")) {
        throw new RevisionError("pr_closed", message);
      }
      throw new RevisionError(classification, message);
    }

    branch = inspection.branch;
    prUrl = inspection.url;
    try {
      assertPrBaseBranchMatches({
        prUrl,
        actualBaseBranch: inspection.baseBranch,
        expectedBaseBranch: resolved.baseBranch,
      });
    } catch (error) {
      throw new RevisionError(
        "wrong_pr_base_branch",
        error instanceof Error ? error.message : String(error),
      );
    }
    changedFiles = inspection.changedFiles.map((f) => f.path);
    checkSummary = inspection.checkSummary;

    if (!branch) {
      throw new RevisionError("missing_branch", "Could not determine PR branch");
    }

    await mkdir(`${runDirectory}/github`, { recursive: true });
    await writeFile(
      getGithubPrBeforePath(runDirectory),
      `${JSON.stringify(inspection, null, 2)}\n`,
      "utf8",
    );
    if (inspection.rawChecks) {
      await writeFile(
        getGithubChecksPath(runDirectory),
        `${JSON.stringify({ check_runs: inspection.rawChecks }, null, 2)}\n`,
        "utf8",
      );
    }
    await events.log("github_pr_inspected", "info", {
      prUrl: inspection.url,
      changedFileCount: changedFiles.length,
    });

    const revisionIdempotencyKey = buildRevisionIdempotencyKey({
      issueKey: issue.identifier,
      pmFeedbackCommentId,
    });
    const acquired = await acquireBuilderAgent({
      apiKey: cursorApiKey,
      config,
      phase: "revision",
      events,
      context: {
        issueKey: issue.identifier,
        harnessRunId: runId,
        targetRepo: markerTargetRepo,
        baseBranch: resolved.baseBranch,
        branch: branch ?? undefined,
        prUrl: prUrl ?? undefined,
        idempotencyKey: revisionIdempotencyKey,
        comments,
        orchestratorMarker: config.orchestratorMarker,
        previousImplementationRunId: previousImplementationRunId ?? undefined,
      },
    });
    builderContinuity = acquired.continuity;
    const builderEvidence = builderMarkerEvidenceFromResolution(
      acquired.continuity,
      revisionIdempotencyKey,
    );
    const agent = acquired.agent;

    const revisingStatus = getTransitionalStatus(config, "revisingInProgress");
    await transitionIssueStatus(client, issue, revisingStatus);
    enteredRevising = true;
    linearStatusAfter = revisingStatus;
    await events.log("linear_status_changed", "info", {
      from: linearStatusBefore,
      to: revisingStatus,
    });

    const repoConfig = config.repos.find((repo) => repo.id === resolved.repoConfigId);
    const validationCommands = repoConfig?.validation?.commands ?? [];
    const { prompt, promptVersion } = await buildRevisionPrompt({
      issue,
      parsed,
      resolved,
      runId,
      branch,
      prUrl,
      pmFeedback: pmFeedbackComment.body,
      changedFiles,
      validationCommands,
    });

    await mkdir(`${runDirectory}/prompts`, { recursive: true });
    await writeFile(getRevisionPromptPath(runDirectory), `${prompt}\n`, "utf8");

    try {
    const timeoutMs =
      (config.revision?.timeoutSeconds ?? DEFAULT_REVISION_TIMEOUT_SECONDS) * 1000;
    const abortController = new AbortController();
    let timeoutError: RevisionError | null = null;
    const timeoutId = setTimeout(() => {
      timeoutError = new RevisionError(
        "cursor_run_timeout",
        `Cursor revision run exceeded ${timeoutMs / 1000}s`,
      );
      abortController.abort(timeoutError);
    }, timeoutMs);

    let observed;
    try {
      observed = await sendAndObserve(agent, prompt, runDirectory, events, {
        phase: "revision",
        targetRepo: markerTargetRepo,
        expectedBranch: branch,
        expectedPrUrl: prUrl,
        abortSignal: abortController.signal,
        apiKey: cursorApiKey,
        model: resolveBuilderModel(config),
        mode: "agent",
        idempotencyKey: revisionIdempotencyKey,
        onBeforeSend: async ({ agentId }) => {
          const commentId = await postPhaseStartCommentIfNeeded(client, issue.id, {
            orchestratorMarker: config.orchestratorMarker,
            phase: "revision_start",
            runId,
            issueKey: issue.identifier,
            targetRepo: markerTargetRepo,
            baseBranch: resolved.baseBranch,
            model,
            promptVersion: REVISION_PROMPT_VERSION,
            branch: branch ?? undefined,
            prUrl: prUrl ?? undefined,
            cursorAgentId: agentId,
            builderAgentId: builderEvidence.builderAgentId,
            builderThreadGeneration: builderEvidence.builderThreadGeneration,
            builderThreadAction: builderEvidence.builderThreadAction,
            builderOriginRunId: builderEvidence.builderOriginRunId,
            builderThreadIdempotencyKey: builderEvidence.builderThreadIdempotencyKey,
            previousBuilderAgentId: builderEvidence.previousBuilderAgentId,
            builderThreadReplacementReason:
              builderEvidence.builderThreadReplacementReason,
          });
          if (commentId) {
            await events.log("phase_start_comment_posted", "info", {
              phase: "revision_start",
              commentId,
            });
            await events.log("linear_comment_posted", "info", {
              phase: "revision_start",
              commentId,
            });
          }
        },
        onAgentCreated: async ({ agentId, runId: createdRunId }) => {
          await events.log("builder_followup_run_started", "info", {
            agentId,
            runId: createdRunId,
            phase: "revision",
          });
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
    cursorRequestId = observed.requestId ?? null;
    branch = observed.gitResult?.branch ?? branch;
    prUrl = observed.gitResult?.prUrl ?? prUrl;
    validationSummary = observed.assistantText;

    await mkdir(`${runDirectory}/outputs`, { recursive: true });
    await writeFile(
      getRevisionResultPath(runDirectory),
      `${observed.assistantText}\n`,
      "utf8",
    );
    await events.log("revision_pr_validated", "info", { prUrl, branch });
    await events.log("validation_completed", "info", { validationSummary });

    const postInspection = await inspectPullRequest(
      github,
      parsePrUrl(prUrl)!,
      markerTargetRepo,
    );
    changedFiles = postInspection.changedFiles.map((f) => f.path);
    checkSummary = postInspection.checkSummary;
    await writeFile(
      getGithubPrAfterPath(runDirectory),
      `${JSON.stringify(postInspection, null, 2)}\n`,
      "utf8",
    );

    const pollTimeout =
      config.preview?.pollTimeoutSeconds ?? DEFAULT_PREVIEW_POLL_TIMEOUT_SECONDS;
    const pollInterval =
      config.preview?.pollIntervalSeconds ?? DEFAULT_PREVIEW_POLL_INTERVAL_SECONDS;

    const previewResult = await pollForVercelPreview(
      async () => {
        const latest = await inspectPullRequest(github, parsedPr, markerTargetRepo);
        return latest.comments;
      },
      {
        pollTimeoutSeconds: pollTimeout,
        pollIntervalSeconds: pollInterval,
      },
    );

    const updatedPreviewUrl = previewResult.previewUrl;
    let previewWarning: string | null = null;
    if (updatedPreviewUrl) {
      previewUrl = updatedPreviewUrl;
      await events.log("preview_captured", "info", {
        previewUrl,
        source: previewResult.source,
      });
    } else {
      previewWarning =
        previewResult.warnings.join("; ") ||
        "Preview URL not updated yet after revision; prior preview may be stale";
      await events.log("preview_not_found", "warn", {
        warnings: previewResult.warnings,
      });
    }

    await mkdir(`${runDirectory}/vercel`, { recursive: true });
    await writeFile(
      getVercelDeploymentPath(runDirectory),
      `${JSON.stringify(previewResult, null, 2)}\n`,
      "utf8",
    );

    const revisionBody = buildRevisionCommentBody({
      summary: validationSummary ?? observed.assistantText,
      prUrl: postInspection.url,
      branch: postInspection.branch,
      targetRepo: markerTargetRepo,
      baseBranch: resolved.baseBranch,
      previewUrl,
      previewWarning,
      changedFiles,
      checkSummary: postInspection.checkSummary,
      validationSummary: validationSummary ?? "",
      harnessRunId: runId,
      previousHandoffRunId,
      pmFeedbackCommentId,
    });

    const revisionCommentId = await postRevisionComment(client, issue.id, revisionBody, {
      ...footerBase,
      promptVersion,
      cursorAgentId: cursorAgentId ?? undefined,
      cursorRunId: cursorRunId ?? undefined,
      branch: branch ?? undefined,
      prUrl: prUrl ?? undefined,
      previewUrl: previewUrl ?? undefined,
      previousHandoffRunId: previousHandoffRunId ?? undefined,
      pmFeedbackCommentId,
      builderAgentId: builderEvidence.builderAgentId,
      builderThreadGeneration: builderEvidence.builderThreadGeneration,
      builderThreadAction: builderEvidence.builderThreadAction,
      builderOriginRunId: builderEvidence.builderOriginRunId,
      builderThreadIdempotencyKey: builderEvidence.builderThreadIdempotencyKey,
      previousBuilderAgentId: builderEvidence.previousBuilderAgentId,
      builderThreadReplacementReason: builderEvidence.builderThreadReplacementReason,
    });
    commentsWritten.push(revisionBody);
    await writeFile(getRevisionCommentPath(runDirectory), `${revisionBody}\n`, "utf8");
    await events.log("revision_comment_posted", "info", {
      commentId: revisionCommentId,
    });
    await events.log("linear_comment_posted", "info", {
      phase: "revision",
      commentId: revisionCommentId,
    });

    const pmReviewStatus = getTransitionalStatus(config, "pmReview");
    await transitionIssueStatus(client, issue, pmReviewStatus);
    linearStatusAfter = pmReviewStatus;
    await events.log("linear_status_changed", "info", {
      from: revisingStatus,
      to: pmReviewStatus,
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
    } finally {
      await disposeAgent(agent);
    }
  } catch (error) {
    if (error instanceof RevisionError) {
      errorClassification = error.classification;
      cursorCleanup = error.cancelOutcome;
    } else if (error instanceof Error) {
      errorClassification = "linear_write_failure";
    } else {
      errorClassification = "linear_write_failure";
    }

    const message = error instanceof Error ? error.message : String(error);
    await writeErrorArtifact(runDirectory, message, errorClassification);

    if (enteredRevising) {
      try {
        await postErrorComment(
          client,
          issue.id,
          message,
          {
            ...footerBase,
            cursorAgentId: cursorAgentId ?? undefined,
            cursorRunId: cursorRunId ?? undefined,
            branch: branch ?? undefined,
            prUrl: prUrl ?? undefined,
            previewUrl: previewUrl ?? undefined,
            previousHandoffRunId: previousHandoffRunId ?? undefined,
            pmFeedbackCommentId: pmFeedbackCommentId ?? undefined,
          },
          "revision",
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
    phase: "revision",
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
    promptVersion: REVISION_PROMPT_VERSION,
    cursorAgentId,
    cursorRunId,
    branch,
    prUrl,
    previewUrl,
    validationSummary,
    changedFiles,
    checkSummary,
    previousImplementationRunId,
    previousHandoffRunId,
    pmFeedbackCommentId,
    ...emptyMergeManifestFields(),
    model,
    modelRole: "builder",
    modelParams: builderModel.modelParams,
    ...(builderContinuity
      ? builderManifestFieldsFromResolution(builderContinuity, cursorRequestId ?? undefined)
      : {
          builderAgentId: null,
          builderThreadAction: null,
          builderThreadGeneration: null,
          builderOriginRunId: null,
          previousBuilderAgentId: null,
          builderThreadReplacementReason: null,
          cursorRequestId,
        }),
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
