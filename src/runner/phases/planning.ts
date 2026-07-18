import { mkdir, writeFile } from "node:fs/promises";
import {
  DEFAULT_PLANNING_TIMEOUT_SECONDS,
  MILESTONE,
} from "../../config/defaults.js";
import { getTransitionalStatus } from "../../config/status-names.js";
import { emptyMergeManifestFields } from "../../artifacts/manifest-fields.js";
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
  postPhaseStartCommentIfNeeded,
  postPlanningComment,
  transitionIssueStatus,
} from "../../linear/writer.js";
import {
  createPlanningAgent,
  disposeAgent,
  sendAndObserve,
} from "../../agents/index.js";
import { manifestModelEvidence } from "../../cursor/model.js";
import { buildPlanningPrompt } from "../../prompts/builder.js";
import { PlanningError } from "../errors.js";
import {
  classifyUnexpectedPhaseError,
  extractErrorMessage,
  isStaleEligibilitySkip,
} from "../classify-phase-error.js";
import { runPreflight } from "../preflight.js";
import { resolveRunGeneration } from "../run-generation.js";
import { updateRunStatusPhase } from "../../linear/run-status-comment.js";
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
import { buildTelemetryCorrelation } from "../../evaluation/telemetry/correlation.js";
import {
  buildPromptProvenance,
  buildSkillProvenance,
  PHASE_ELIGIBLE_SKILLS,
} from "../../evaluation/telemetry/provenance.js";
import {
  agentObsMetadataFromObserved,
  emitPromptProvenanceEvent,
  emitSkillProvenanceEvent,
} from "../../evaluation/telemetry/phase-emit.js";
import type { EvaluationRuntime, NestedObservationHandle, PhaseTraceHandle } from "../../evaluation/types.js";
import {
  finalizePhaseEvaluation,
  safeStartPhaseTrace,
} from "../../evaluation/phase-helpers.js";
import { agentObservationDisplayName } from "../../evaluation/naming.js";
import { promptNameForPhase } from "../../prompts/skill-inject.js";
import { allowsLangfuseContentProjection } from "../../evaluation/telemetry/profiles.js";
import { boundRedactedContent } from "../../evaluation/telemetry/redact.js";
import { MAX_LANGFUSE_CONTENT_CHARS } from "../../evaluation/telemetry/bounds.js";
import { buildArtifactRef } from "../../evaluation/telemetry/artifact-ref.js";

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

export interface PlanningPhaseOptions {
  issueKey: string;
  configPath: string;
  force?: boolean;
  evaluationRuntime?: EvaluationRuntime;
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
  evaluationRuntime: EvaluationRuntime | null = null,
  phaseTrace: PhaseTraceHandle | null = null,
  extraEvalMetadata?: Record<string, unknown>,
): Promise<PlanningPhaseResult> {
  const finalManifest = await finalizePhaseEvaluation({
    runtime: evaluationRuntime,
    phaseTrace,
    manifest,
    runDirectory,
    extraMetadata: extraEvalMetadata,
  });

  if (runDirectory) {
    await writeManifest(runDirectory, finalManifest);
    await writeRunSummary(runDirectory, finalManifest, parsed, resolved);
    await events?.log("run_finished", finalOutcome === "success" ? "info" : "error", {
      finalOutcome,
      errorClassification,
    });
  }

  const exitCode =
    finalOutcome === "success" ||
    finalOutcome === "duplicate" ||
    finalOutcome === "skipped"
      ? 0
      : finalOutcome === "failed" && !errorClassification
        ? 2
        : errorClassification &&
            ["ambiguous_issue", "missing_target_repo", "unknown_repo_denied"].includes(
              errorClassification,
            ) ||
            errorClassification === "base_branch_missing"
          ? 2
          : 3;

  return { manifest: finalManifest, runDirectory, exitCode };
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
    const isDuplicateDelivery =
      preflight.errorClassification === "duplicate_delivery";
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
      finalOutcome: isDuplicateDelivery ? "duplicate" : "failed",
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
      model: preflight.config
        ? manifestModelEvidence(preflight.config, "planner").model
        : null,
      modelRole: preflight.config ? "planner" : null,
      modelParams: preflight.config
        ? manifestModelEvidence(preflight.config, "planner").modelParams
        : null,
      deliveryId: process.env.LINEAR_DELIVERY_ID ?? null,
      runGeneration: resolveRunGeneration(),
      runOwnedStatuses: preflight.issue?.status ? [preflight.issue.status] : null,
    };
    return writeFinalManifest(
      manifest,
      preflight.runDirectory,
      preflight.parsed,
      preflight.resolved,
      preflight.events,
      isDuplicateDelivery ? "duplicate" : "failed",
      preflight.errorClassification,
    );
  }

  const {
    config,
    issue: preflightIssue,
    parsed,
    resolved,
    productInitialization,
    runId,
    runDirectory,
    events,
    phase,
    phaseInferredFromStatus,
    startedAt,
  } = preflight.context;

  let issue = preflightIssue;
  const linearStatusBefore = issue.status;
  let linearStatusAfter = issue.status;
  let finalOutcome: FinalOutcome = "failed";
  let errorClassification: ErrorClassification = null;
  let validationSummary: string | null = null;
  let cursorAgentId: string | null = null;
  let cursorRunId: string | null = null;
  let promptVersion: string | null = null;
  const plannerModel = manifestModelEvidence(config, "planner");
  const model = plannerModel.model;
  let enteredPlanning = false;
  const commentsWritten: string[] = [];
  let phaseTrace: PhaseTraceHandle | null = null;
  let plannerObs: NestedObservationHandle | null = null;
  let extraEvalMetadata: Record<string, unknown> | undefined;

  const footerBase = {
    orchestratorMarker: config.orchestratorMarker,
    phase: "planning",
    runId,
    model,
    promptVersion: "planning@1",
    targetRepo: resolved.targetRepo,
    baseBranch: resolved.baseBranch,
  };

  const deliveryId = process.env.LINEAR_DELIVERY_ID ?? null;
  const runGeneration = resolveRunGeneration();
  let runOwnedStatuses = [linearStatusBefore].filter(Boolean) as string[];

  const client = createLinearClient(linearApiKey);

  try {
    const freshIssue = await fetchLinearIssue(options.issueKey, linearApiKey);
    issue = freshIssue;
    linearStatusAfter = freshIssue.status;
    runOwnedStatuses = [linearStatusBefore, freshIssue.status].filter(Boolean) as string[];

    try {
      assertPlanningEligibleStatus(config, freshIssue, Boolean(options.force));
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
      previousHandoffRunId: null,
      pmFeedbackCommentId: null,
        ...emptyMergeManifestFields(),
        model,
        deliveryId,
        runGeneration,
        runOwnedStatuses,
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
    runOwnedStatuses = [...runOwnedStatuses, planningStatus];
    await events.log("linear_status_changed", "info", {
      from: linearStatusBefore,
      to: planningStatus,
    });

    await updateRunStatusPhase(client, issue.id, {
      phase: planningStatus,
      headline: "Planning in progress",
      runId,
      deliveryId,
      generation: runGeneration,
    });

    const { prompt: basePrompt, promptVersion: version } =
      await buildPlanningPrompt(issue, parsed, resolved, {
        productInitializationState: productInitialization.state,
      });
    promptVersion = version;
    const { assembleAgentPrompt } = await import("../../prompts/assemble.js");
    const skillInjection = await assembleAgentPrompt({
      phase: "planning",
      localCompiledPrompt: basePrompt,
    });
    const prompt = skillInjection.prompt;
    await mkdir(`${runDirectory}/prompts`, { recursive: true });
    const planningPromptPath = getPlanningPromptPath(runDirectory);
    await writeFile(planningPromptPath, `${prompt}\n`, "utf8");

    phaseTrace = await safeStartPhaseTrace(options.evaluationRuntime, {
      phase: "planning",
      issueKey: issue.identifier,
      runId,
      linearTeamKey: issue.teamKey ?? null,
      metadata: {
        modelId: model,
        modelRole: "planner",
        promptContractVersion: version,
      },
    });

    const telemetryCorrelation = buildTelemetryCorrelation({
      namespace: options.evaluationRuntime?.namespace ?? "default",
      issueKey: issue.identifier,
      harnessRunId: runId,
      phase: "planning",
      providerTraceId: phaseTrace?.correlation.traceId,
    });
    const promptProvenance = await buildPromptProvenance({
      runDirectory,
      promptContractVersion: version,
      promptTemplatePath: "src/prompts/planning.md",
      renderedPromptAbsolutePath: planningPromptPath,
    });
    const declaredSkills = skillInjection.skillsUsed.map((s) => ({
      skillId: s.skillId,
      sourcePath: s.sourcePath,
      role: s.role,
    }));
    const skillProvenance = await buildSkillProvenance({
      eligible: PHASE_ELIGIBLE_SKILLS.planning ?? [],
      declared: declaredSkills,
      observed: declaredSkills,
    });
    const onTelemetry = (e: Parameters<NonNullable<PhaseTraceHandle["onTelemetryEvent"]>>[0]) =>
      phaseTrace?.onTelemetryEvent?.(e);
    const promptPreview = allowsLangfuseContentProjection(
      phaseTrace?.correlation.captureProfile ?? "metadata-v1",
    )
      ? boundRedactedContent(prompt, MAX_LANGFUSE_CONTENT_CHARS).text
      : undefined;
    await emitPromptProvenanceEvent(
      runDirectory,
      telemetryCorrelation,
      {
        ...promptProvenance,
        promptName: promptNameForPhase("planning"),
        promptAssemblySchemaVersion: 1,
        renderedPromptPreview: promptPreview,
        promptProvider: skillInjection.assembly.provider,
        promptSource: skillInjection.assembly.source,
        providerPromptVersion: skillInjection.assembly.providerPromptVersion,
        providerLabel: skillInjection.assembly.providerLabel,
        providerTemplateSha256: skillInjection.assembly.providerTemplateSha256,
        localTemplateSha256: skillInjection.assembly.localTemplateSha256,
        fallbackUsed: skillInjection.assembly.fallbackUsed,
        fallbackReason: skillInjection.assembly.fallbackReason,
        skillInvocationMode: skillInjection.assembly.skillInvocationMode,
        langfusePromptLinked: skillInjection.assembly.langfusePromptLinked,
        langfusePromptJson: skillInjection.langfusePromptLinkJson,
        nativeCapabilityState: skillInjection.assembly.nativeCapabilityState,
        componentOrdering: skillInjection.assembly.componentOrdering,
        variablesUsed: skillInjection.assembly.variablesUsed,
      },
      onTelemetry,
    );
    await emitSkillProvenanceEvent(
      runDirectory,
      telemetryCorrelation,
      {
        ...skillProvenance,
        skillsUsed: skillInjection.skillsUsed.map((s) => ({
          skillId: s.skillId,
          sourcePath: s.sourcePath,
          role: s.role,
          contentSha256: s.contentSha256,
          inclusionMethod: s.inclusionMethod,
          discovered: s.discovered,
          invoked: s.invoked,
          evidenceSource: s.evidenceSource,
          fallbackReason: s.fallbackReason,
        })),
        skillProvenanceStatus: skillInjection.skillProvenanceStatus,
      },
      onTelemetry,
    );

    const agent = await createPlanningAgent({
      apiKey: cursorApiKey,
      config,
      targetRepo: resolved.targetRepo,
      baseBranch: resolved.baseBranch,
    });

    try {
    const timeoutMs =
      (config.planning?.timeoutSeconds ?? DEFAULT_PLANNING_TIMEOUT_SECONDS) *
      1000;

    plannerObs =
      phaseTrace?.startChild(
        agentObservationDisplayName({
          issueKey: issue.identifier,
          role: "planner",
        }),
        "agent",
      ) ?? null;
    if (plannerObs && promptPreview) {
      plannerObs.update({
        input: promptPreview,
        metadata: {
          promptName: promptNameForPhase("planning"),
          promptContractVersion: version,
          linearIssueKey: issue.identifier,
          agentRole: "planner",
        },
      });
    }

    const observed = await Promise.race([
      sendAndObserve(agent, prompt, runDirectory, events, {
        apiKey: cursorApiKey,
        phase: "planning",
        telemetryCorrelation,
        onTelemetryEvent: onTelemetry,
        onAgentCreated: async ({ agentId, runId: cursorRunId }) => {
          const commentId = await postPhaseStartCommentIfNeeded(client, issue.id, {
            orchestratorMarker: config.orchestratorMarker,
            phase: "planning_start",
            runId,
            issueKey: issue.identifier,
            targetRepo: resolved.targetRepo,
            baseBranch: resolved.baseBranch,
            model,
            promptVersion: version,
            cursorAgentId: agentId,
            cursorRunId,
          });
          if (commentId) {
            await events.log("phase_start_comment_posted", "info", {
              phase: "planning_start",
              commentId,
            });
            await events.log("linear_comment_posted", "info", {
              phase: "planning_start",
              commentId,
            });
          }
        },
      }),
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
    const planningResultPath = getPlanningResultPath(runDirectory);
    await writeFile(
      planningResultPath,
      `${observed.assistantText}\n`,
      "utf8",
    );
    const outputRef = await buildArtifactRef({
      runDirectory,
      absolutePath: planningResultPath,
      artifactKind: "agent_output",
    });
    const endMeta = {
      modelId: observed.model?.id ?? model,
      modelRole: "planner",
      promptName: promptNameForPhase("planning"),
      linearIssueKey: issue.identifier,
      agentRole: "planner",
      agentOutputSha256: outputRef?.sha256 ?? null,
      agentOutputByteCount: outputRef?.byteCount ?? null,
      ...agentObsMetadataFromObserved({
        ...observed,
        requestedModel: {
          id: plannerModel.model,
          params: plannerModel.modelParams ?? undefined,
          parameterEvidenceSource: plannerModel.parameterEvidenceSource,
          providerDefaultParams: plannerModel.providerDefaultParams,
          harnessDefaultParams: plannerModel.harnessDefaultParams,
        },
      }),
    };
    if (
      plannerObs &&
      phaseTrace &&
      allowsLangfuseContentProjection(phaseTrace.correlation.captureProfile)
    ) {
      plannerObs.end({
        output: boundRedactedContent(
          observed.assistantText,
          MAX_LANGFUSE_CONTENT_CHARS,
        ).text,
        metadata: endMeta,
        model: observed.model?.id ?? model,
      });
    } else {
      plannerObs?.end(endMeta);
    }
    extraEvalMetadata = endMeta;

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
    } finally {
      await disposeAgent(agent);
    }
  } catch (error) {
    const message = extractErrorMessage(error);
    if (error instanceof PlanningError) {
      errorClassification = error.classification;
    } else {
      errorClassification = classifyUnexpectedPhaseError(error);
    }
    validationSummary = message;
    await events.log("phase_error", "error", {
      message,
      errorClassification,
      enteredPlanning,
    });
    await writeErrorArtifact(runDirectory, message, errorClassification);

    if (isStaleEligibilitySkip(error, enteredPlanning)) {
      finalOutcome = "skipped";
      await events.log("stale_eligibility_skip", "info", {
        reason: message,
        status: linearStatusAfter,
      });
    } else if (enteredPlanning) {
      try {
        await postErrorComment(client, issue.id, message, {
          ...footerBase,
          promptVersion: promptVersion ?? "planning@1",
          cursorAgentId: cursorAgentId ?? undefined,
          cursorRunId: cursorRunId ?? undefined,
        });
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
    validationSummary,
    changedFiles: null,
    checkSummary: null,
    previousImplementationRunId: null,
    previousHandoffRunId: null,
    pmFeedbackCommentId: null,
    ...emptyMergeManifestFields(),
    model,
    modelRole: "planner",
    modelParams: plannerModel.modelParams,
    deliveryId,
    runGeneration,
    runOwnedStatuses,
  };

  return writeFinalManifest(
    manifest,
    runDirectory,
    parsed,
    resolved,
    events,
    finalOutcome,
    errorClassification,
    options.evaluationRuntime ?? null,
    phaseTrace,
    extraEvalMetadata,
  );
}
