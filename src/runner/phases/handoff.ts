import { mkdir, writeFile } from "node:fs/promises";
import {
  DEFAULT_HANDOFF_ALLOW_PM_REVIEW_WITHOUT_PREVIEW,
  DEFAULT_PREVIEW_POLL_INTERVAL_SECONDS,
  DEFAULT_PREVIEW_POLL_TIMEOUT_SECONDS,
  HANDOFF_PROMPT_VERSION,
  MILESTONE,
} from "../../config/defaults.js";
import { getTransitionalStatus } from "../../config/status-names.js";
import { emptyMergeManifestFields } from "../../artifacts/manifest-fields.js";
import { writeManifest } from "../../artifacts/manifest.js";
import { writeRunSummary } from "../../artifacts/summary.js";
import {
  getGithubChecksPath,
  getGithubPrPath,
  getHandoffCommentPath,
  getImplementationCommentLoadedPath,
  getIssueSnapshotAfterPath,
  getVercelDeploymentPath,
} from "../../artifacts/paths.js";
import {
  buildHandoffCommentBody,
  writeCommentsArtifact,
} from "../../linear/comments.js";
import { fetchLinearIssue } from "../../linear/client.js";
import { findLatestImplementationComment } from "../../linear/implementation-comment.js";
import { parseHarnessMarkers } from "../../linear/markers.js";
import {
  createLinearClient,
  listIssueComments,
  postErrorComment,
  postHandoffComment,
  transitionIssueStatus,
} from "../../linear/writer.js";
import { GitHubClient } from "../../github/client.js";
import {
  classifyGitHubError,
  inspectPullRequest,
} from "../../github/pr-inspector.js";
import { parsePrUrl } from "../../github/pr-url.js";
import { pollForVercelPreview } from "../../preview/vercel-from-pr.js";
import { normalizeRepoUrl } from "../../resolver/normalize-repo.js";
import { resolveModelId } from "../../cursor/model.js";
import { HandoffError } from "../errors.js";
import { runPreflight } from "../preflight.js";
import {
  assertHandoffEligibleStatus,
  checkHandoffIdempotency,
} from "../idempotency.js";
import type { EventLogger } from "../../artifacts/events.js";
import type {
  ErrorClassification,
  FinalOutcome,
  RunManifest,
} from "../../types/run.js";
import type { ParsedIssue } from "../../types/parsed-issue.js";
import type { ResolvedTarget } from "../../resolver/target-repo.js";

export interface HandoffPhaseOptions {
  issueKey: string;
  configPath: string;
  force?: boolean;
}

export interface HandoffPhaseResult {
  manifest: RunManifest;
  runDirectory: string;
  exitCode: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new HandoffError(
      name === "LINEAR_API_KEY" ? "linear_auth_failure" : "github_auth_failure",
      `${name} is required for live handoff runs`,
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
): Promise<HandoffPhaseResult> {
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
      : errorClassification &&
          [
            "ambiguous_issue",
            "missing_target_repo",
            "unknown_repo_denied",
            "wrong_status",
            "github_auth_failure",
            "missing_implementation_marker",
            "missing_pr_url",
          ].includes(errorClassification)
        ? 2
        : 3;

  return { manifest, runDirectory, exitCode };
}

export async function executeHandoffPhase(
  options: HandoffPhaseOptions,
): Promise<HandoffPhaseResult> {
  let linearApiKey: string;
  let githubToken: string;

  try {
    githubToken = requireEnv("GITHUB_TOKEN");
    linearApiKey = requireEnv("LINEAR_API_KEY");
  } catch (error) {
    if (error instanceof HandoffError) {
      const startedAt = new Date().toISOString();
      const manifest: RunManifest = {
        runId: `auth-failure-${options.issueKey}`,
        issueKey: options.issueKey,
        phase: "handoff",
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
        changedFiles: null,
        checkSummary: null,
        previousImplementationRunId: null,
      previousHandoffRunId: null,
      pmFeedbackCommentId: null,
      ...emptyMergeManifestFields(),
      model: null,
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
      phase: "handoff",
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
  let branch: string | null = null;
  let prUrl: string | null = null;
  let previewUrl: string | null = null;
  let changedFiles: string[] | null = null;
  let checkSummary: string | null = null;
  let previousImplementationRunId: string | null = null;
  let enteredHandoff = false;
  const model = resolveModelId(config);
  const commentsWritten: string[] = [];

  const footerBase = {
    orchestratorMarker: config.orchestratorMarker,
    phase: "handoff",
    runId,
    model,
    promptVersion: HANDOFF_PROMPT_VERSION,
    targetRepo: resolved.targetRepo,
  };

  const client = createLinearClient(linearApiKey);
  const github = new GitHubClient({ token: githubToken });

  try {
    const comments = await listIssueComments(client, issue.id);
    const idempotency = checkHandoffIdempotency(
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
        promptVersion: HANDOFF_PROMPT_VERSION,
        cursorAgentId: null,
        cursorRunId: null,
        branch,
        prUrl,
        previewUrl,
        validationSummary: null,
        changedFiles,
        checkSummary,
        previousImplementationRunId,
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

    try {
      assertHandoffEligibleStatus(config, issue, Boolean(options.force));
    } catch (error) {
      throw new HandoffError(
        "wrong_status",
        error instanceof Error ? error.message : String(error),
      );
    }

    const implementationComment = findLatestImplementationComment(
      comments,
      config.orchestratorMarker,
    );
    if (!implementationComment) {
      throw new HandoffError(
        "missing_implementation_marker",
        "No durable implementation marker comment found",
      );
    }

    const markers = parseHarnessMarkers(implementationComment.body);
    if (!markers.prUrl) {
      throw new HandoffError(
        "missing_pr_url",
        "Implementation marker is missing pr_url",
      );
    }

    prUrl = markers.prUrl;
    branch = markers.branch ?? null;
    previousImplementationRunId = markers.runId ?? null;
    const markerTargetRepo = normalizeRepoUrl(
      markers.targetRepo ?? resolved.targetRepo,
    );

    await mkdir(`${runDirectory}/linear`, { recursive: true });
    await writeFile(
      getImplementationCommentLoadedPath(runDirectory),
      `${implementationComment.body}\n`,
      "utf8",
    );
    await events.log("implementation_comment_loaded", "info", {
      commentId: implementationComment.id,
      previousImplementationRunId,
    });

    enteredHandoff = true;

    const parsedPr = parsePrUrl(prUrl);
    if (!parsedPr) {
      throw new HandoffError("missing_pr_url", `Invalid PR URL: ${prUrl}`);
    }

    let inspection;
    try {
      inspection = await inspectPullRequest(github, parsedPr, markerTargetRepo);
    } catch (error) {
      const classification = classifyGitHubError(error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("wrong_target_repo")) {
        throw new HandoffError("wrong_target_repo", message);
      }
      if (message.includes("pr_closed")) {
        throw new HandoffError("pr_closed", message);
      }
      throw new HandoffError(classification, message);
    }

    branch = inspection.branch;
    prUrl = inspection.url;
    changedFiles = inspection.changedFiles.map((f) => f.path);
    checkSummary = inspection.checkSummary;

    await mkdir(`${runDirectory}/github`, { recursive: true });
    await writeFile(
      getGithubPrPath(runDirectory),
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

    const pollTimeout =
      config.preview?.pollTimeoutSeconds ?? DEFAULT_PREVIEW_POLL_TIMEOUT_SECONDS;
    const pollInterval =
      config.preview?.pollIntervalSeconds ?? DEFAULT_PREVIEW_POLL_INTERVAL_SECONDS;

    await events.log("preview_poll_started", "info", {
      pollTimeoutSeconds: pollTimeout,
      pollIntervalSeconds: pollInterval,
    });

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

    previewUrl = previewResult.previewUrl;

    await mkdir(`${runDirectory}/vercel`, { recursive: true });
    await writeFile(
      getVercelDeploymentPath(runDirectory),
      `${JSON.stringify(previewResult, null, 2)}\n`,
      "utf8",
    );

    if (previewUrl) {
      await events.log("preview_captured", "info", {
        previewUrl,
        source: previewResult.source,
      });
    } else {
      await events.log("preview_not_found", "warn", {
        warnings: previewResult.warnings,
      });
    }

    const allowWithoutPreview =
      config.handoff?.allowPmReviewWithoutPreview ??
      DEFAULT_HANDOFF_ALLOW_PM_REVIEW_WITHOUT_PREVIEW;

    if (!previewUrl && !allowWithoutPreview) {
      throw new HandoffError(
        "preview_not_found",
        previewResult.warnings.join("; ") || "Vercel preview URL not found",
      );
    }

    const previewWarning =
      !previewUrl && allowWithoutPreview
        ? previewResult.warnings.join("; ") ||
          "Preview URL not found; proceeding to PM Review per fallback policy"
        : null;

    const handoffBody = buildHandoffCommentBody({
      prTitle: inspection.title,
      prUrl: inspection.url,
      branch: inspection.branch,
      targetRepo: markerTargetRepo,
      previewUrl,
      previewWarning,
      changedFiles,
      checkSummary: inspection.checkSummary,
      harnessRunId: runId,
      previousImplementationRunId,
    });

    const handoffCommentId = await postHandoffComment(client, issue.id, handoffBody, {
      ...footerBase,
      branch: branch ?? undefined,
      prUrl: prUrl ?? undefined,
      previewUrl: previewUrl ?? undefined,
      previousImplementationRunId: previousImplementationRunId ?? undefined,
    });
    commentsWritten.push(handoffBody);
    await mkdir(`${runDirectory}/linear`, { recursive: true });
    await writeFile(getHandoffCommentPath(runDirectory), `${handoffBody}\n`, "utf8");
    await events.log("handoff_comment_posted", "info", {
      commentId: handoffCommentId,
    });
    await events.log("linear_comment_posted", "info", {
      phase: "handoff",
      commentId: handoffCommentId,
    });

    const pmReviewStatus = getTransitionalStatus(config, "pmReview");
    await transitionIssueStatus(client, issue, pmReviewStatus);
    linearStatusAfter = pmReviewStatus;
    await events.log("linear_status_changed", "info", {
      from: linearStatusBefore,
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
  } catch (error) {
    if (error instanceof HandoffError) {
      errorClassification = error.classification;
    } else if (error instanceof Error) {
      errorClassification = "linear_write_failure";
    } else {
      errorClassification = "linear_write_failure";
    }

    const message = error instanceof Error ? error.message : String(error);
    await writeErrorArtifact(runDirectory, message, errorClassification);

    if (enteredHandoff) {
      try {
        await postErrorComment(
          client,
          issue.id,
          message,
          {
            ...footerBase,
            branch: branch ?? undefined,
            prUrl: prUrl ?? undefined,
            previewUrl: previewUrl ?? undefined,
            previousImplementationRunId: previousImplementationRunId ?? undefined,
          },
          "handoff",
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
    phase: "handoff",
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
    promptVersion: HANDOFF_PROMPT_VERSION,
    cursorAgentId: null,
    cursorRunId: null,
    branch,
    prUrl,
    previewUrl,
    validationSummary: checkSummary,
    changedFiles,
    checkSummary,
    previousImplementationRunId,
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
