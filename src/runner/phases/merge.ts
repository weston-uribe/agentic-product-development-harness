import { mkdir, writeFile } from "node:fs/promises";
import {
  DEFAULT_MERGE_DEPLOYMENT_POLL_INTERVAL_SECONDS,
  DEFAULT_MERGE_DEPLOYMENT_POLL_TIMEOUT_SECONDS,
  DEFAULT_MERGE_CHECK_POLL_TIMEOUT_SECONDS,
  DEFAULT_MERGE_DEPLOYMENT_REQUIRED,
  DEFAULT_MERGE_METHOD,
  MERGE_PROMPT_VERSION,
  MILESTONE,
} from "../../config/defaults.js";
import { getTransitionalStatus } from "../../config/status-names.js";
import { writeManifest } from "../../artifacts/manifest.js";
import { writeRunSummary } from "../../artifacts/summary.js";
import {
  getGithubChecksBeforeMergePath,
  getGithubMergeResultPath,
  getGithubPrAfterMergePath,
  getGithubPrBeforeMergePath,
  getIssueSnapshotAfterPath,
  getMergeCompletionCommentPath,
  getMergeRecoveryPath,
  getMergeSourceCommentLoadedPath,
  getProductionDeploymentPath,
} from "../../artifacts/paths.js";
import {
  buildMergeCompletionCommentBody,
  writeCommentsArtifact,
} from "../../linear/comments.js";
import { fetchLinearIssue } from "../../linear/client.js";
import { findLatestMergeSourceComment } from "../../linear/merge-source-comment.js";
import {
  createLinearClient,
  listIssueComments,
  postErrorComment,
  postMergeCompletionComment,
  transitionIssueStatus,
} from "../../linear/writer.js";
import { GitHubClient } from "../../github/client.js";
import { evaluateChecksForMerge } from "../../github/check-policy.js";
import { classifyMergeError, isAlreadyMergedError } from "../../github/merge-result.js";
import {
  classifyGitHubError,
  inspectPullRequestForMerge,
  inspectPullRequestPostMerge,
} from "../../github/pr-inspector.js";
import { parsePrUrl } from "../../github/pr-url.js";
import { pollForProductionDeployment, inferVercelReadyFromComments } from "../../preview/production-from-merge.js";
import { normalizeRepoUrl } from "../../resolver/normalize-repo.js";
import { resolveModelId } from "../../cursor/model.js";
import { MergeError } from "../errors.js";
import { runPreflight } from "../preflight.js";
import {
  assertMergeEligibleStatus,
  checkMergeIdempotency,
} from "../idempotency.js";
import type { HarnessConfig } from "../../config/types.js";
import type { EventLogger } from "../../artifacts/events.js";
import type {
  ErrorClassification,
  FinalOutcome,
  RunManifest,
} from "../../types/run.js";
import type { ParsedIssue } from "../../types/parsed-issue.js";
import type { ResolvedTarget } from "../../resolver/target-repo.js";

export interface MergePhaseOptions {
  issueKey: string;
  configPath: string;
  force?: boolean;
}

export interface MergePhaseResult {
  manifest: RunManifest;
  runDirectory: string;
  exitCode: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MergeError(
      name === "LINEAR_API_KEY" ? "linear_auth_failure" : "github_auth_failure",
      `${name} is required for live merge runs`,
    );
  }
  return value;
}

function emptyMergeManifestFields() {
  return {
    changedFiles: null as string[] | null,
    checkSummary: null as string | null,
    previousImplementationRunId: null as string | null,
    previousHandoffRunId: null as string | null,
    pmFeedbackCommentId: null as string | null,
    previousRevisionRunId: null as string | null,
    mergeCommitSha: null as string | null,
    mergeMethod: null as string | null,
    mergedAt: null as string | null,
    deploymentUrl: null as string | null,
  };
}

function getProductionUrlReference(
  config: HarnessConfig,
  repoConfigId: string,
): string | null {
  const mapping = config.repos.find((repo) => repo.id === repoConfigId);
  return mapping?.productionUrl ?? null;
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

async function writeMergeRecoveryArtifact(
  runDirectory: string,
  recovery: Record<string, unknown>,
): Promise<void> {
  await mkdir(`${runDirectory}/outputs`, { recursive: true });
  await writeFile(
    getMergeRecoveryPath(runDirectory),
    `${JSON.stringify(recovery, null, 2)}\n`,
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
): Promise<MergePhaseResult> {
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
            "linear_auth_failure",
            "github_auth_failure",
            "missing_merge_source_marker",
            "missing_pr_url",
            "checks_failing",
            "checks_pending",
            "checks_unknown",
          ].includes(errorClassification)
        ? 2
        : 3;

  return { manifest, runDirectory, exitCode };
}

async function postCompletionAndTransition(
  client: ReturnType<typeof createLinearClient>,
  issue: import("../../linear/client.js").LinearIssueSnapshot,
  mergeBody: string,
  footer: Parameters<typeof postMergeCompletionComment>[3],
  mergedDeployedStatus: string,
  events: EventLogger,
  linearStatusBefore: string | null,
): Promise<string> {
  const commentId = await postMergeCompletionComment(
    client,
    issue.id,
    mergeBody,
    footer,
  );
  await events.log("merge_comment_posted", "info", { commentId });
  await events.log("linear_comment_posted", "info", {
    phase: "merge",
    commentId,
  });
  await transitionIssueStatus(client, issue, mergedDeployedStatus);
  await events.log("linear_status_changed", "info", {
    from: linearStatusBefore,
    to: mergedDeployedStatus,
  });
  return mergedDeployedStatus;
}

export async function executeMergePhase(
  options: MergePhaseOptions,
): Promise<MergePhaseResult> {
  let linearApiKey: string;
  let githubToken: string;

  try {
    githubToken = requireEnv("GITHUB_TOKEN");
    linearApiKey = requireEnv("LINEAR_API_KEY");
  } catch (error) {
    if (error instanceof MergeError) {
      const startedAt = new Date().toISOString();
      const manifest: RunManifest = {
        runId: `auth-failure-${options.issueKey}`,
        issueKey: options.issueKey,
        phase: "merge",
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
        ...emptyMergeManifestFields(),
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
      phase: "merge",
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
      model: preflight.config ? resolveModelId(preflight.config) : null,
      ...emptyMergeManifestFields(),
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
  let validationSummary: string | null = null;
  let changedFiles: string[] | null = null;
  let checkSummary: string | null = null;
  let previousHandoffRunId: string | null = null;
  let previousRevisionRunId: string | null = null;
  let mergeCommitSha: string | null = null;
  let mergeMethod: string | null =
    config.merge?.mergeMethod ?? DEFAULT_MERGE_METHOD;
  let mergedAt: string | null = null;
  let deploymentUrl: string | null = null;
  let enteredMerging = false;
  let prMerged = false;
  const model = resolveModelId(config);
  const commentsWritten: string[] = [];

  const footerBase = {
    orchestratorMarker: config.orchestratorMarker,
    phase: "merge",
    runId,
    model,
    promptVersion: MERGE_PROMPT_VERSION,
    targetRepo: resolved.targetRepo,
  };

  const client = createLinearClient(linearApiKey);
  const github = new GitHubClient({ token: githubToken });
  const mergedDeployedStatus = getTransitionalStatus(config, "mergedDeployed");
  const mergingStatus = getTransitionalStatus(config, "mergingInProgress");

  try {
    const comments = await listIssueComments(client, issue.id);
    const mergeSource = findLatestMergeSourceComment(
      comments,
      config.orchestratorMarker,
    );
    if (!mergeSource) {
      throw new MergeError(
        "missing_merge_source_marker",
        "No durable handoff or revision marker comment found",
      );
    }

    const sourceMarkers = mergeSource.markers;
    if (!sourceMarkers.prUrl) {
      throw new MergeError(
        "missing_pr_url",
        "Merge source marker is missing pr_url",
      );
    }

    prUrl = sourceMarkers.prUrl;
    branch = sourceMarkers.branch ?? null;
    previewUrl = sourceMarkers.previewUrl ?? null;
    previousHandoffRunId =
      mergeSource.source === "revision"
        ? sourceMarkers.previousHandoffRunId ?? null
        : sourceMarkers.runId ?? null;
    previousRevisionRunId =
      mergeSource.source === "revision" ? sourceMarkers.runId ?? null : null;

    const markerTargetRepo = normalizeRepoUrl(
      sourceMarkers.targetRepo ?? resolved.targetRepo,
    );

    await mkdir(`${runDirectory}/linear`, { recursive: true });
    await writeFile(
      getMergeSourceCommentLoadedPath(runDirectory),
      `${mergeSource.comment.body}\n`,
      "utf8",
    );
    await events.log("merge_source_comment_loaded", "info", {
      commentId: mergeSource.comment.id,
      source: mergeSource.source,
    });

    const parsedPr = parsePrUrl(prUrl);
    if (!parsedPr) {
      throw new MergeError("missing_pr_url", `Invalid PR URL: ${prUrl}`);
    }

    let preInspection;
    try {
      preInspection = await inspectPullRequestForMerge(
        github,
        parsedPr,
        markerTargetRepo,
      );
    } catch (error) {
      const classification = classifyGitHubError(error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("wrong_target_repo")) {
        throw new MergeError("wrong_target_repo", message);
      }
      if (message.includes("pr_closed")) {
        throw new MergeError("pr_closed", message);
      }
      throw new MergeError(classification, message);
    }

    prMerged = preInspection.merged;
    branch = preInspection.branch;
    prUrl = preInspection.url;
    changedFiles = preInspection.changedFiles.map((f) => f.path);
    checkSummary = preInspection.checkSummary;

    const idempotency = checkMergeIdempotency(
      config,
      issue,
      comments,
      prUrl,
      prMerged,
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
        promptVersion: MERGE_PROMPT_VERSION,
        cursorAgentId: null,
        cursorRunId: null,
        branch,
        prUrl,
        previewUrl,
        validationSummary,
        changedFiles,
        checkSummary,
        previousImplementationRunId: null,
        previousHandoffRunId,
        pmFeedbackCommentId: sourceMarkers.pmFeedbackCommentId ?? null,
        previousRevisionRunId,
        mergeCommitSha: preInspection.mergeCommitSha,
        mergeMethod,
        mergedAt: preInspection.mergedAt,
        deploymentUrl,
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
      throw new MergeError("wrong_status", idempotency.reason);
    }

    const isRecovery = idempotency.reason?.startsWith("recovery:");

    if (!isRecovery) {
      try {
        assertMergeEligibleStatus(config, issue, Boolean(options.force));
      } catch (error) {
        throw new MergeError(
          "wrong_status",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    await mkdir(`${runDirectory}/github`, { recursive: true });
    await writeFile(
      getGithubPrBeforeMergePath(runDirectory),
      `${JSON.stringify(preInspection, null, 2)}\n`,
      "utf8",
    );
    if (preInspection.rawChecks) {
      await writeFile(
        getGithubChecksBeforeMergePath(runDirectory),
        `${JSON.stringify({ check_runs: preInspection.rawChecks }, null, 2)}\n`,
        "utf8",
      );
    }

    if (!prMerged) {
      const checkPollTimeout =
        config.merge?.checkPollTimeoutSeconds ?? DEFAULT_MERGE_CHECK_POLL_TIMEOUT_SECONDS;
      const checkPollInterval =
        config.merge?.deploymentPollIntervalSeconds ??
        DEFAULT_MERGE_DEPLOYMENT_POLL_INTERVAL_SECONDS;

      let checkPolicy = evaluateChecksForMerge(preInspection.checks, config);
      const pollDeadline = Date.now() + checkPollTimeout * 1000;

      while (
        checkPolicy.decision === "block" &&
        checkPolicy.classification === "checks_pending" &&
        Date.now() < pollDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, checkPollInterval * 1000));
        preInspection = await inspectPullRequestForMerge(
          github,
          parsedPr,
          markerTargetRepo,
        );
        checkPolicy = evaluateChecksForMerge(preInspection.checks, config);
      }

      await events.log("merge_checks_evaluated", "info", {
        decision: checkPolicy.decision,
        reason: checkPolicy.reason,
      });
      if (
        checkPolicy.decision === "block" &&
        (checkPolicy.classification === "checks_pending" ||
          checkPolicy.classification === "checks_unknown") &&
        inferVercelReadyFromComments(preInspection.comments)
      ) {
        const warning =
          "GitHub checks inconclusive; proceeding because Vercel deployment comment reports Ready";
        validationSummary = [validationSummary, warning].filter(Boolean).join("; ");
        checkPolicy = {
          decision: "allow",
          classification: null,
          reason: warning,
          warnings: [warning],
        };
      }
      if (checkPolicy.decision === "block") {
        throw new MergeError(
          checkPolicy.classification ?? "checks_failing",
          checkPolicy.reason,
        );
      }
      if (checkPolicy.warnings.length > 0) {
        validationSummary = checkPolicy.warnings.join("; ");
      }

      changedFiles = preInspection.changedFiles.map((f) => f.path);
      checkSummary = preInspection.checkSummary;
      await writeFile(
        getGithubPrBeforeMergePath(runDirectory),
        `${JSON.stringify(preInspection, null, 2)}\n`,
        "utf8",
      );
      if (preInspection.rawChecks) {
        await writeFile(
          getGithubChecksBeforeMergePath(runDirectory),
          `${JSON.stringify({ check_runs: preInspection.rawChecks }, null, 2)}\n`,
          "utf8",
        );
      }

      await transitionIssueStatus(client, issue, mergingStatus);
      enteredMerging = true;
      linearStatusAfter = mergingStatus;
      await events.log("linear_status_changed", "info", {
        from: linearStatusBefore,
        to: mergingStatus,
      });

      await events.log("github_merge_requested", "info", {
        prUrl,
        mergeMethod,
      });

      try {
        const mergeResult = await github.mergePullRequest(
          parsedPr.owner,
          parsedPr.repo,
          parsedPr.pullNumber,
          { mergeMethod: mergeMethod as "squash", commitTitle: preInspection.title },
        );
        mergeCommitSha = mergeResult.sha;
        prMerged = mergeResult.merged;
        await writeFile(
          getGithubMergeResultPath(runDirectory),
          `${JSON.stringify(mergeResult, null, 2)}\n`,
          "utf8",
        );
        await events.log("github_merge_completed", "info", {
          mergeCommitSha,
          merged: prMerged,
        });
      } catch (error) {
        if (isAlreadyMergedError(error)) {
          prMerged = true;
        } else {
          const classification = classifyMergeError(error);
          throw new MergeError(
            classification,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } else {
      mergeCommitSha = preInspection.mergeCommitSha;
      mergedAt = preInspection.mergedAt;
    }

    let postInspection;
    try {
      postInspection = await inspectPullRequestPostMerge(
        github,
        parsedPr,
        markerTargetRepo,
      );
    } catch {
      postInspection = preInspection;
    }

    mergeCommitSha = postInspection.mergeCommitSha ?? mergeCommitSha;
    mergedAt = postInspection.mergedAt ?? mergedAt;
    if (!changedFiles?.length) {
      changedFiles = postInspection.changedFiles.map((f) => f.path);
    }

    await writeFile(
      getGithubPrAfterMergePath(runDirectory),
      `${JSON.stringify(postInspection, null, 2)}\n`,
      "utf8",
    );

    if (enteredMerging && !postInspection.merged) {
      throw new MergeError(
        "github_merge_failure",
        "Pull request was not merged after merge request",
      );
    }

    const deploymentPollTimeout =
      config.merge?.deploymentPollTimeoutSeconds ??
      DEFAULT_MERGE_DEPLOYMENT_POLL_TIMEOUT_SECONDS;
    const deploymentPollInterval =
      config.merge?.deploymentPollIntervalSeconds ??
      DEFAULT_MERGE_DEPLOYMENT_POLL_INTERVAL_SECONDS;
    const productionReference = getProductionUrlReference(
      config,
      resolved.repoConfigId,
    );

    await events.log("deployment_poll_started", "info", {
      pollTimeoutSeconds: deploymentPollTimeout,
    });

    const deploymentResult = await pollForProductionDeployment(
      async () => {
        const latest = await inspectPullRequestPostMerge(
          github,
          parsedPr,
          markerTargetRepo,
        ).catch(() => postInspection);
        return {
          comments: latest.comments,
          checks: latest.checks,
        };
      },
      {
        pollTimeoutSeconds: deploymentPollTimeout,
        pollIntervalSeconds: deploymentPollInterval,
        productionUrlReference: productionReference,
      },
    );

    deploymentUrl = deploymentResult.deploymentUrl;
    await mkdir(`${runDirectory}/vercel`, { recursive: true });
    await writeFile(
      getProductionDeploymentPath(runDirectory),
      `${JSON.stringify(deploymentResult, null, 2)}\n`,
      "utf8",
    );

    const deploymentRequired =
      config.merge?.deploymentRequiredForSuccess ??
      DEFAULT_MERGE_DEPLOYMENT_REQUIRED;

    let deploymentWarning: string | null = null;
    if (!deploymentUrl) {
      deploymentWarning =
        deploymentResult.warnings.join("; ") ||
        "Production deployment URL not captured";
      await events.log("deployment_not_found", "warn", {
        warnings: deploymentResult.warnings,
      });
      if (deploymentRequired) {
        throw new MergeError("deployment_not_found", deploymentWarning);
      }
      validationSummary = [validationSummary, deploymentWarning]
        .filter(Boolean)
        .join("; ");
    } else {
      await events.log("deployment_captured", "info", {
        deploymentUrl,
        source: deploymentResult.source,
      });
    }

    const mergeBody = buildMergeCompletionCommentBody({
      prTitle: postInspection.title,
      prUrl: postInspection.url,
      branch: postInspection.branch,
      targetRepo: markerTargetRepo,
      mergeMethod: mergeMethod ?? DEFAULT_MERGE_METHOD,
      mergeCommitSha,
      mergedAt,
      baseBranch: postInspection.baseBranch,
      deploymentUrl,
      deploymentWarning,
      changedFiles: changedFiles ?? [],
      checkSummary: checkSummary ?? postInspection.checkSummary,
      finalIssueStatus: mergedDeployedStatus,
      harnessRunId: runId,
      previousHandoffRunId,
      previousRevisionRunId,
    });

    const mergeFooter = {
      ...footerBase,
      branch: branch ?? undefined,
      prUrl: prUrl ?? undefined,
      previewUrl: previewUrl ?? undefined,
      previousHandoffRunId: previousHandoffRunId ?? undefined,
      previousRevisionRunId: previousRevisionRunId ?? undefined,
      pmFeedbackCommentId: sourceMarkers.pmFeedbackCommentId ?? undefined,
      mergeCommitSha: mergeCommitSha ?? undefined,
      deploymentUrl: deploymentUrl ?? undefined,
    };

    if (!enteredMerging && !isRecovery) {
      await transitionIssueStatus(client, issue, mergingStatus);
      enteredMerging = true;
      linearStatusAfter = mergingStatus;
    }

    linearStatusAfter = await postCompletionAndTransition(
      client,
      issue,
      mergeBody,
      mergeFooter,
      mergedDeployedStatus,
      events,
      linearStatusBefore,
    );

    await writeFile(getMergeCompletionCommentPath(runDirectory), `${mergeBody}\n`, "utf8");
    commentsWritten.push(mergeBody);

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
    if (error instanceof MergeError) {
      errorClassification = error.classification;
    } else {
      errorClassification = "linear_write_failure";
    }

    const message = error instanceof Error ? error.message : String(error);
    await writeErrorArtifact(runDirectory, message, errorClassification);

    const mergeFooter = {
      ...footerBase,
      branch: branch ?? undefined,
      prUrl: prUrl ?? undefined,
      previewUrl: previewUrl ?? undefined,
      previousHandoffRunId: previousHandoffRunId ?? undefined,
      previousRevisionRunId: previousRevisionRunId ?? undefined,
      mergeCommitSha: mergeCommitSha ?? undefined,
      deploymentUrl: deploymentUrl ?? undefined,
    };

    if (prMerged && errorClassification === "linear_write_failure") {
      const mergeBody = buildMergeCompletionCommentBody({
        prTitle: "Merged PR",
        prUrl: prUrl ?? "unknown",
        branch: branch ?? "unknown",
        targetRepo: resolved.targetRepo,
        mergeMethod: mergeMethod ?? DEFAULT_MERGE_METHOD,
        mergeCommitSha,
        mergedAt,
        baseBranch: resolved.baseBranch,
        deploymentUrl,
        deploymentWarning: validationSummary,
        changedFiles: changedFiles ?? [],
        checkSummary: checkSummary ?? "n/a",
        finalIssueStatus: mergedDeployedStatus,
        harnessRunId: runId,
        previousHandoffRunId,
        previousRevisionRunId,
      });

      await writeMergeRecoveryArtifact(runDirectory, {
        prUrl,
        merged: true,
        mergeCommitSha,
        intendedLinearStatus: mergedDeployedStatus,
        intendedCommentBody: mergeBody,
        mergeRunId: runId,
        error: message,
      });
      await events.log("merge_recovery_written", "warn", { prUrl, mergeCommitSha });
      linearStatusAfter = mergingStatus;
    } else if (enteredMerging) {
      try {
        await postErrorComment(client, issue.id, message, mergeFooter, "merge");
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
    phase: "merge",
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
    promptVersion: MERGE_PROMPT_VERSION,
    cursorAgentId: null,
    cursorRunId: null,
    branch,
    prUrl,
    previewUrl,
    validationSummary,
    changedFiles,
    checkSummary,
    previousImplementationRunId: null,
    previousHandoffRunId,
    pmFeedbackCommentId: null,
    previousRevisionRunId,
    mergeCommitSha,
    mergeMethod,
    mergedAt,
    deploymentUrl,
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
