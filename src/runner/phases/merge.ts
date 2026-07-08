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
import {
  getTransitionalStatus,
  resolveMergeSuccessStatus,
} from "../../config/status-names.js";
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
  parsePrNumberFromUrl,
  writeCommentsArtifact,
} from "../../linear/comments.js";
import { parseHarnessMarkers } from "../../linear/markers.js";
import { fetchLinearIssue } from "../../linear/client.js";
import { findLatestMergeSourceComment } from "../../linear/merge-source-comment.js";
import {
  createLinearClient,
  listIssueComments,
  postErrorComment,
  postMergeCompletionComment,
  postPhaseStartCommentIfNeeded,
  transitionIssueStatus,
} from "../../linear/writer.js";
import { GitHubClient } from "../../github/client.js";
import {
  assertPrBaseBranchMatches,
  assertPullRequestMergeable,
  isIntegrationRepairEligible,
} from "../../github/base-branch.js";
import { evaluateChecksForMerge } from "../../github/check-policy.js";
import { classifyMergeError, isAlreadyMergedError } from "../../github/merge-result.js";
import {
  classifyGitHubError,
  inspectPullRequestForMerge,
  inspectPullRequestPostMerge,
} from "../../github/pr-inspector.js";
import { parsePrUrl, type ParsedPrUrl } from "../../github/pr-url.js";
import { pollForProductionDeployment, inferVercelReadyFromComments } from "../../preview/production-from-merge.js";
import { resolvePreviewLinks } from "../../preview/urls.js";
import { normalizeRepoUrl } from "../../resolver/normalize-repo.js";
import { resolveModelId } from "../../cursor/model.js";
import { MergeError } from "../errors.js";
import { attemptIntegrationRepair } from "./integration-repair.js";
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

const DRAFT_READY_POLL_TIMEOUT_MS = 30_000;
const DRAFT_READY_POLL_INTERVAL_MS = 2_000;
const MAX_REPAIR_FAILURES_PER_ISSUE = 3;

function countRepairFailuresForPr(
  comments: Awaited<ReturnType<typeof listIssueComments>>,
  orchestratorMarker: string,
  prUrl: string,
): number {
  return comments.filter((comment) => {
    const markers = parseHarnessMarkers(comment.body);
    return (
      markers.orchestratorMarker === orchestratorMarker &&
      markers.phase === "repair_failed" &&
      markers.prUrl === prUrl
    );
  }).length;
}

async function ensurePullRequestReadyForMerge(
  github: GitHubClient,
  parsedPr: ParsedPrUrl,
  markerTargetRepo: string,
  events: EventLogger,
  prUrl: string,
  initialInspection: Awaited<ReturnType<typeof inspectPullRequestForMerge>>,
): Promise<Awaited<ReturnType<typeof inspectPullRequestForMerge>>> {
  if (!initialInspection.isDraft) {
    return initialInspection;
  }

  await github.markPullRequestReadyForReview(
    parsedPr.owner,
    parsedPr.repo,
    parsedPr.pullNumber,
  );

  const deadline = Date.now() + DRAFT_READY_POLL_TIMEOUT_MS;
  let pollCount = 0;
  let lastDraft = true;
  while (Date.now() < deadline) {
    const inspection = await inspectPullRequestForMerge(
      github,
      parsedPr,
      markerTargetRepo,
    );
    pollCount += 1;
    lastDraft = inspection.isDraft;
    if (!inspection.isDraft) {
      await events.log("github_pr_marked_ready", "info", { prUrl, pollCount });
      return inspection;
    }
    await new Promise((resolve) => setTimeout(resolve, DRAFT_READY_POLL_INTERVAL_MS));
  }

  throw new MergeError(
    "github_merge_failure",
    `Pull request remained draft after mark-ready request (pollCount=${pollCount}, lastDraft=${lastDraft})`,
  );
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
            "base_branch_missing",
            "wrong_pr_base_branch",
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
  mergeSuccessStatus: string,
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
  await transitionIssueStatus(client, issue, mergeSuccessStatus);
  await events.log("linear_status_changed", "info", {
    from: linearStatusBefore,
    to: mergeSuccessStatus,
  });
  return mergeSuccessStatus;
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
    baseBranch: resolved.baseBranch,
  };

  const client = createLinearClient(linearApiKey);
  const github = new GitHubClient({ token: githubToken });
  const mergeSuccessStatus = resolveMergeSuccessStatus(resolved, config);
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

    const earlyIdempotency = checkMergeIdempotency(
      config,
      issue,
      comments,
      prUrl,
      false,
      Boolean(options.force),
    );
    if (earlyIdempotency.skip) {
      await events.log("idempotency_skip", "info", { reason: earlyIdempotency.reason });
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
        mergeCommitSha: null,
        mergeMethod,
        mergedAt: null,
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

    const readyToMerge = getTransitionalStatus(config, "readyToMerge");
    const issueStatus = issue.status?.trim() ?? "";
    if (issueStatus.toLowerCase() === readyToMerge.toLowerCase()) {
      await transitionIssueStatus(client, issue, mergingStatus);
      enteredMerging = true;
      linearStatusAfter = mergingStatus;
      await events.log("linear_status_changed", "info", {
        from: linearStatusBefore,
        to: mergingStatus,
      });

      const mergeStartCommentId = await postPhaseStartCommentIfNeeded(
        client,
        issue.id,
        {
          orchestratorMarker: config.orchestratorMarker,
          phase: "merge_start",
          runId,
          issueKey: issue.identifier,
          targetRepo: markerTargetRepo,
          baseBranch: resolved.baseBranch,
          model,
          promptVersion: MERGE_PROMPT_VERSION,
          branch: branch ?? undefined,
          prUrl,
        },
      );
      if (mergeStartCommentId) {
        await events.log("phase_start_comment_posted", "info", {
          phase: "merge_start",
          commentId: mergeStartCommentId,
        });
        await events.log("linear_comment_posted", "info", {
          phase: "merge_start",
          commentId: mergeStartCommentId,
        });
      }
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
    try {
      assertPrBaseBranchMatches({
        prUrl,
        actualBaseBranch: preInspection.baseBranch,
        expectedBaseBranch: resolved.baseBranch,
      });
    } catch (error) {
      throw new MergeError(
        "wrong_pr_base_branch",
        error instanceof Error ? error.message : String(error),
      );
    }
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

      if (preInspection.isDraft) {
        preInspection = await ensurePullRequestReadyForMerge(
          github,
          parsedPr,
          markerTargetRepo,
          events,
          prUrl,
          preInspection,
        );
      }

      preInspection = await inspectPullRequestForMerge(
        github,
        parsedPr,
        markerTargetRepo,
      );
      assertPrBaseBranchMatches({
        prUrl: preInspection.url,
        actualBaseBranch: preInspection.baseBranch,
        expectedBaseBranch: resolved.baseBranch,
      });
      try {
        assertPullRequestMergeable({
          prUrl: preInspection.url,
          merged: preInspection.merged,
          mergeable: preInspection.mergeable,
          mergeableState: preInspection.mergeableState,
          baseBranch: resolved.baseBranch,
        });
      } catch (error) {
        if (
          isIntegrationRepairEligible({
            mergeable: preInspection.mergeable,
            mergeableState: preInspection.mergeableState,
          })
        ) {
          const repairFailureCount = countRepairFailuresForPr(
            comments,
            config.orchestratorMarker,
            preInspection.url,
          );
          if (repairFailureCount >= MAX_REPAIR_FAILURES_PER_ISSUE) {
            throw new MergeError(
              "github_merge_failure",
              `Integration repair has already failed ${repairFailureCount} time(s) for this PR. Manual recovery is required.`,
            );
          }
          const repair = await attemptIntegrationRepair({
            github,
            linearClient: client,
            issue,
            config,
            parsedIssue: parsed,
            resolved,
            parsedPr,
            markerTargetRepo,
            runId,
            runDirectory,
            events,
            model,
            initialInspection: preInspection,
            cursorApiKey: process.env.CURSOR_API_KEY,
          });
          preInspection = repair.inspection;
          changedFiles = preInspection.changedFiles.map((f) => f.path);
          checkSummary = preInspection.checkSummary;
          validationSummary = [validationSummary, repair.validationSummary]
            .filter(Boolean)
            .join("; ");
          try {
            assertPullRequestMergeable({
              prUrl: preInspection.url,
              merged: preInspection.merged,
              mergeable: preInspection.mergeable,
              mergeableState: preInspection.mergeableState,
              baseBranch: resolved.baseBranch,
            });
          } catch (postRepairError) {
            throw new MergeError(
              "github_merge_failure",
              postRepairError instanceof Error
                ? postRepairError.message
                : String(postRepairError),
            );
          }
        } else {
          throw new MergeError(
            "github_merge_failure",
            error instanceof Error ? error.message : String(error),
          );
        }
      }

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

    const mergedToProduction = resolved.baseBranch === resolved.productionBranch;
    const productionReference = getProductionUrlReference(
      config,
      resolved.repoConfigId,
    );

    if (mergedToProduction) {
      const deploymentPollTimeout =
        config.merge?.deploymentPollTimeoutSeconds ??
        DEFAULT_MERGE_DEPLOYMENT_POLL_TIMEOUT_SECONDS;
      const deploymentPollInterval =
        config.merge?.deploymentPollIntervalSeconds ??
        DEFAULT_MERGE_DEPLOYMENT_POLL_INTERVAL_SECONDS;

      await events.log("deployment_poll_started", "info", {
        pollTimeoutSeconds: deploymentPollTimeout,
        mergedToProduction: true,
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
    } else {
      await events.log("deployment_poll_skipped", "info", {
        reason: "integration_merge",
        baseBranch: resolved.baseBranch,
        productionBranch: resolved.productionBranch,
      });
    }

    const previewLinks = resolvePreviewLinks({
      prPreviewUrl: previewUrl,
      integrationPreviewUrl: resolved.integrationPreviewUrl,
      productionUrl: productionReference,
      capturedDeploymentUrl: deploymentUrl,
      mergedBaseBranch: postInspection.baseBranch,
      productionBranch: resolved.productionBranch,
    });

    const mergeBody = buildMergeCompletionCommentBody({
      prUrl: postInspection.url,
      branch: postInspection.branch,
      targetRepo: markerTargetRepo,
      mergeMethod: mergeMethod ?? DEFAULT_MERGE_METHOD,
      mergeCommitSha,
      mergedAt,
      baseBranch: postInspection.baseBranch,
      productionBranch: resolved.productionBranch,
      previewLinks,
      deploymentWarning: validationSummary,
      changedFiles: changedFiles ?? [],
      checkSummary: checkSummary ?? postInspection.checkSummary,
      finalIssueStatus: mergeSuccessStatus,
      harnessRunId: runId,
      previousHandoffRunId,
      previousRevisionRunId,
    });

    const mergeFooter = {
      ...footerBase,
      issueKey: options.issueKey,
      productionBranch: resolved.productionBranch,
      integrationSuccessStatus:
        resolved.integrationSuccessStatus ??
        getTransitionalStatus(config, "mergedToDev"),
      branch: branch ?? undefined,
      prUrl: prUrl ?? undefined,
      prNumber: prUrl ? (parsePrNumberFromUrl(prUrl) ?? undefined) : undefined,
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
      mergeSuccessStatus,
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
      const previewLinks = resolvePreviewLinks({
        prPreviewUrl: previewUrl,
        integrationPreviewUrl: resolved.integrationPreviewUrl,
        productionUrl: getProductionUrlReference(config, resolved.repoConfigId),
        capturedDeploymentUrl: deploymentUrl,
        mergedBaseBranch: resolved.baseBranch,
        productionBranch: resolved.productionBranch,
      });
      const mergeBody = buildMergeCompletionCommentBody({
        prUrl: prUrl ?? "unknown",
        branch: branch ?? "unknown",
        targetRepo: resolved.targetRepo,
        mergeMethod: mergeMethod ?? DEFAULT_MERGE_METHOD,
        mergeCommitSha,
        mergedAt,
        baseBranch: resolved.baseBranch,
        productionBranch: resolved.productionBranch,
        previewLinks,
        deploymentWarning: validationSummary,
        changedFiles: changedFiles ?? [],
        checkSummary: checkSummary ?? "n/a",
        finalIssueStatus: mergeSuccessStatus,
        harnessRunId: runId,
        previousHandoffRunId,
        previousRevisionRunId,
      });

      await writeMergeRecoveryArtifact(runDirectory, {
        prUrl,
        merged: true,
        mergeCommitSha,
        intendedLinearStatus: mergeSuccessStatus,
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
