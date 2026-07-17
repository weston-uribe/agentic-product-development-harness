import { DEFAULT_MERGE_METHOD } from "../config/defaults.js";
import { loadHarnessConfig } from "../config/load-config.js";
import { GitHubApiError, type GitHubClient } from "../github/client.js";
import { assertPrBaseBranchMatches } from "../github/base-branch.js";
import { evaluateChecksForMerge } from "../github/check-policy.js";
import {
  classifyMergeError,
  isAlreadyMergedError,
} from "../github/merge-result.js";
import {
  inspectPullRequestForMerge,
} from "../github/pr-inspector.js";
import { parsePrUrl } from "../github/pr-url.js";
import { redactSecretsString } from "../artifacts/redact.js";
import {
  formatHarnessDispatchRepo,
  resolveHarnessDispatchRepo,
} from "./harness-dispatch-repo.js";
import { targetRepoSlugFromUrl } from "./harness-secret-setup.js";
import {
  TARGET_WORKFLOW_PATH,
  type RemoteWorkflowStatus,
} from "./remote-actions.js";
import {
  buildTargetWorkflowBranchName,
  buildTargetWorkflowPrTitle,
  compareTargetWorkflowContent,
  previewTargetWorkflowSetup,
} from "./target-workflow-setup.js";
import {
  blockedCategoryMessage,
  classifyWorkflowInstallMergeRejection,
} from "./workflow-install-merge-errors.js";
import {
  countOpenPullRequestsOnBranch,
  isInstallBranchAlreadyClean,
  isStaleHarnessInstallBranch,
  recoverHarnessInstallBranch,
  validateInstallBranchRecoveryProof,
} from "./workflow-install-branch-recovery.js";
import type { GitHubRemoteSetupProvider } from "./github-remote-provider.js";
import {
  buildFinalizationLockKey,
  withTargetWorkflowFinalizationLock,
} from "./target-workflow-finalization-lock.js";
import type {
  TargetWorkflowFinalizeInput,
  TargetWorkflowFinalizationResult,
  WorkflowInstallBlockedCategory,
  WorkflowInstallLifecycle,
} from "./target-workflow-finalization-types.js";
import {
  WORKFLOW_INSTALL_CHECK_POLL_TIMEOUT_MS,
  WORKFLOW_INSTALL_VERIFICATION_TIMEOUT_MS,
} from "./target-workflow-finalization-types.js";

interface FinalizationSession {
  checksPendingSince?: number;
  verificationStartedAt?: number;
  lastValidatedHeadSha?: string;
  mergeAttemptedForHeadSha?: string;
  branchUpdateAttemptedForHeadSha?: string;
  recoveryAttemptedForHeadSha?: string;
}

const sessions = new Map<string, FinalizationSession>();

function sessionKey(targetRepoSlug: string, repoConfigId: string): string {
  return `${targetRepoSlug}:${repoConfigId}`;
}

function blockedResult(input: {
  repoConfigId: string;
  targetRepo: string;
  targetRepoSlug: string;
  productionBranch: string;
  branchName: string;
  category: WorkflowInstallBlockedCategory;
  workflowStatus: RemoteWorkflowStatus;
  prUrl?: string;
  prNumber?: number;
  validatedHeadSha?: string;
  advancedThisRequest: boolean;
  lockContended: boolean;
  customMessage?: string;
}): TargetWorkflowFinalizationResult {
  return {
    repoConfigId: input.repoConfigId,
    targetRepo: input.targetRepo,
    targetRepoSlug: input.targetRepoSlug,
    productionBranch: input.productionBranch,
    branchName: input.branchName,
    lifecycle: "blocked",
    blockedCategory: input.category,
    message: input.customMessage ?? blockedCategoryMessage(input.category),
    prUrl: input.prUrl,
    prNumber: input.prNumber,
    validatedHeadSha: input.validatedHeadSha,
    workflowStatus: input.workflowStatus,
    canRetry: input.category === "verification-failed",
    requiresGitHubIntervention: ![
      "checks-pending",
      "mergeability-pending",
      "branch-behind",
      "verification-failed",
    ].includes(input.category),
    advancedThisRequest: input.advancedThisRequest,
    lockContended: input.lockContended,
  };
}

function progressResult(input: {
  repoConfigId: string;
  targetRepo: string;
  targetRepoSlug: string;
  productionBranch: string;
  branchName: string;
  lifecycle: WorkflowInstallLifecycle;
  workflowStatus: RemoteWorkflowStatus;
  message: string;
  prUrl?: string;
  prNumber?: number;
  validatedHeadSha?: string;
  advancedThisRequest: boolean;
  lockContended: boolean;
  blockedCategory?: WorkflowInstallBlockedCategory;
  canRetry?: boolean;
  requiresGitHubIntervention?: boolean;
}): TargetWorkflowFinalizationResult {
  return {
    repoConfigId: input.repoConfigId,
    targetRepo: input.targetRepo,
    targetRepoSlug: input.targetRepoSlug,
    productionBranch: input.productionBranch,
    branchName: input.branchName,
    lifecycle: input.lifecycle,
    blockedCategory: input.blockedCategory,
    message: input.message,
    prUrl: input.prUrl,
    prNumber: input.prNumber,
    validatedHeadSha: input.validatedHeadSha,
    workflowStatus: input.workflowStatus,
    canRetry: input.canRetry ?? false,
    requiresGitHubIntervention: input.requiresGitHubIntervention ?? false,
    advancedThisRequest: input.advancedThisRequest,
    lockContended: input.lockContended,
  };
}

function completeResult(input: {
  repoConfigId: string;
  targetRepo: string;
  targetRepoSlug: string;
  productionBranch: string;
  branchName: string;
  prUrl?: string;
  prNumber?: number;
  validatedHeadSha?: string;
  advancedThisRequest: boolean;
  lockContended: boolean;
}): TargetWorkflowFinalizationResult {
  sessions.delete(sessionKey(input.targetRepoSlug, input.repoConfigId));
  return progressResult({
    ...input,
    lifecycle: "complete",
    workflowStatus: "present",
    message: "Workflow installed on the production branch.",
    advancedThisRequest: input.advancedThisRequest,
    lockContended: input.lockContended,
  });
}

async function readWorkflowAtRef(
  client: GitHubClient,
  targetRepoSlug: string,
  workflowPath: string,
  ref: string,
): Promise<string | null> {
  const [owner, repo] = targetRepoSlug.split("/");
  const content = await client.getRepositoryContent(
    owner,
    repo,
    workflowPath,
    ref,
  );
  return content ? client.decodeRepositoryContent(content) : null;
}

async function findOpenInstallPullRequest(
  client: GitHubClient,
  input: {
    targetRepoSlug: string;
    productionBranch: string;
    branchName: string;
  },
): Promise<{ number: number; html_url: string; headSha: string } | null> {
  const [owner, repo] = input.targetRepoSlug.split("/");
  const pulls = await client.listPullRequests(owner, repo, {
    state: "open",
    base: input.productionBranch,
    head: `${owner}:${input.branchName}`,
  });
  const first = pulls[0];
  if (!first) {
    return null;
  }
  return {
    number: first.number,
    html_url: first.html_url,
    headSha: first.head.sha,
  };
}

function validatePullRequestFiles(
  files: Array<{ path: string }>,
  workflowPath: string,
): boolean {
  if (files.length !== 1) {
    return false;
  }
  return files[0]?.path === workflowPath;
}

const REFRESHING_BRANCH_MESSAGE =
  "Refreshing the workflow install branch…";

interface AttemptStaleInstallBranchRecoveryInput {
  client: GitHubClient;
  input: TargetWorkflowFinalizeInput;
  targetRepoSlug: string;
  branchName: string;
  productionStatus: { workflowStatus: RemoteWorkflowStatus };
  intendedWorkflowContent: string;
  inspection: Awaited<ReturnType<typeof inspectPullRequestForMerge>>;
  parsedPr: NonNullable<ReturnType<typeof parsePrUrl>>;
  prUrl: string;
  prNumber: number;
  validatedHeadSha: string;
  session: FinalizationSession;
  lockContended: boolean;
  filesValidationPassed: boolean;
}

async function attemptStaleInstallBranchRecovery(
  recoveryInput: AttemptStaleInstallBranchRecoveryInput,
): Promise<TargetWorkflowFinalizationResult | null> {
  const {
    client,
    input,
    targetRepoSlug,
    branchName,
    productionStatus,
    intendedWorkflowContent,
    inspection,
    parsedPr,
    prUrl,
    prNumber,
    validatedHeadSha,
    session,
    lockContended,
    filesValidationPassed,
  } = recoveryInput;

  if (session.recoveryAttemptedForHeadSha === validatedHeadSha) {
    return null;
  }

  const headWorkflowContent = await readWorkflowAtRef(
    client,
    targetRepoSlug,
    TARGET_WORKFLOW_PATH,
    inspection.headSha,
  );
  const headWorkflowMatchesIntended =
    headWorkflowContent !== null &&
    compareTargetWorkflowContent(headWorkflowContent, intendedWorkflowContent) ===
      "present";

  const [owner, repo] = targetRepoSlug.split("/");
  let compareStatus: string | null = null;
  try {
    const compare = await client.compareCommits(
      owner,
      repo,
      input.productionBranch,
      branchName,
    );
    compareStatus = compare.status;
  } catch {
    compareStatus = null;
  }

  if (
    !isStaleHarnessInstallBranch({
      changedFiles: inspection.changedFiles,
      workflowPath: TARGET_WORKFLOW_PATH,
      mergeableState: inspection.mergeableState,
      compareStatus,
      headWorkflowMatchesIntended,
      filesValidationPassed,
    })
  ) {
    return null;
  }

  const openPullCount = await countOpenPullRequestsOnBranch(client, {
    targetRepoSlug,
    productionBranch: input.productionBranch,
    branchName,
  });
  const proof = validateInstallBranchRecoveryProof({
    configuredTargetRepoSlug: targetRepoSlug,
    observedTargetRepoSlug: targetRepoSlug,
    configuredRepoConfigId: input.repoConfigId,
    reservedBranchName: branchName,
    observedBranchName: inspection.branch,
    configuredProductionBranch: input.productionBranch,
    observedProductionBranch: inspection.baseBranch,
    configuredWorkflowPath: TARGET_WORKFLOW_PATH,
    pullRequestOwner: parsedPr.owner,
    pullRequestRepo: parsedPr.repo,
    openPullRequestsOnBranch: openPullCount,
  });
  if (!proof.ok) {
    session.recoveryAttemptedForHeadSha = validatedHeadSha;
    sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "unexpected-pr-content",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
      customMessage: proof.reason,
    });
  }

  const alreadyClean = await isInstallBranchAlreadyClean({
    client,
    targetRepoSlug,
    productionBranch: input.productionBranch,
    branchName,
    workflowPath: TARGET_WORKFLOW_PATH,
    intendedWorkflowContent,
  });
  session.recoveryAttemptedForHeadSha = validatedHeadSha;
  sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
  if (alreadyClean) {
    return null;
  }

  await recoverHarnessInstallBranch({
    client,
    targetRepoSlug,
    productionBranch: input.productionBranch,
    branchName,
    workflowPath: TARGET_WORKFLOW_PATH,
    workflowContent: intendedWorkflowContent,
  });

  return progressResult({
    repoConfigId: input.repoConfigId,
    targetRepo: input.targetRepo,
    targetRepoSlug,
    productionBranch: input.productionBranch,
    branchName,
    lifecycle: "updating-branch",
    workflowStatus: productionStatus.workflowStatus,
    message: REFRESHING_BRANCH_MESSAGE,
    prUrl,
    prNumber,
    validatedHeadSha,
    advancedThisRequest: true,
    lockContended,
    blockedCategory: "branch-behind",
  });
}

export interface AdvanceTargetWorkflowFinalizationOptions {
  cwd?: string;
  input: TargetWorkflowFinalizeInput;
  provider: GitHubRemoteSetupProvider;
  client: GitHubClient;
  lockContended?: boolean;
}

export async function advanceTargetWorkflowFinalizationStep(
  options: AdvanceTargetWorkflowFinalizationOptions,
): Promise<TargetWorkflowFinalizationResult> {
  const { input, provider, client, lockContended = false } = options;
  const targetRepoSlug = targetRepoSlugFromUrl(input.targetRepo);
  if (!targetRepoSlug) {
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug: "<invalid>",
      productionBranch: input.productionBranch,
      branchName: buildTargetWorkflowBranchName(input.repoConfigId),
      category: "unexpected-pr-content",
      workflowStatus: "unknown",
      advancedThisRequest: true,
      lockContended,
      customMessage: `Invalid target repo URL: ${input.targetRepo}`,
    });
  }

  const branchName =
    input.branchName ?? buildTargetWorkflowBranchName(input.repoConfigId);
  const harnessDispatchRepo = await resolveHarnessDispatchRepo({
    cwd: options.cwd,
    manualRepo: input.manualHarnessDispatchRepo,
  });
  const preview = previewTargetWorkflowSetup({
    repoConfigId: input.repoConfigId,
    targetRepo: input.targetRepo,
    productionBranch: input.productionBranch,
    harnessDispatchRepo,
  });
  const intendedWorkflowContent = preview.workflowContent;
  const harnessDispatchRepoSlug = formatHarnessDispatchRepo(harnessDispatchRepo);

  const productionStatus = await provider.checkTargetWorkflowStatus({
    targetRepoSlug,
    workflowPath: TARGET_WORKFLOW_PATH,
    intendedWorkflowContent,
    productionBranch: input.productionBranch,
  });

  if (productionStatus.workflowStatus === "present") {
    return completeResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      advancedThisRequest: true,
      lockContended,
    });
  }

  const session =
    sessions.get(sessionKey(targetRepoSlug, input.repoConfigId)) ?? {};

  let prUrl = input.prUrl;
  let prNumber: number | undefined;
  let validatedHeadSha: string | undefined;

  if (prUrl) {
    const parsed = parsePrUrl(prUrl);
    if (parsed) {
      prNumber = parsed.pullNumber;
    }
  }

  if (!prUrl) {
    const discovered = await findOpenInstallPullRequest(client, {
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
    });
    if (discovered) {
      prUrl = discovered.html_url;
      prNumber = discovered.number;
      validatedHeadSha = discovered.headSha;
    }
  }

  if (!prUrl || !prNumber) {
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "unexpected-pr-content",
      workflowStatus: productionStatus.workflowStatus,
      advancedThisRequest: true,
      lockContended,
      customMessage:
        "No open workflow install PR was found for the deterministic install branch.",
    });
  }

  const parsedPr = parsePrUrl(prUrl);
  if (!parsedPr) {
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "unexpected-pr-content",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      advancedThisRequest: true,
      lockContended,
    });
  }

  let inspection = await inspectPullRequestForMerge(
    client,
    parsedPr,
    input.targetRepo,
  );

  if (inspection.merged) {
    const reverified = await provider.checkTargetWorkflowStatus({
      targetRepoSlug,
      workflowPath: TARGET_WORKFLOW_PATH,
      intendedWorkflowContent,
      productionBranch: input.productionBranch,
    });
    if (reverified.workflowStatus === "present") {
      return completeResult({
        repoConfigId: input.repoConfigId,
        targetRepo: input.targetRepo,
        targetRepoSlug,
        productionBranch: input.productionBranch,
        branchName,
        prUrl,
        prNumber,
        advancedThisRequest: true,
        lockContended,
      });
    }
    session.verificationStartedAt ??= Date.now();
    if (
      Date.now() - session.verificationStartedAt >
      WORKFLOW_INSTALL_VERIFICATION_TIMEOUT_MS
    ) {
      sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
      return blockedResult({
        repoConfigId: input.repoConfigId,
        targetRepo: input.targetRepo,
        targetRepoSlug,
        productionBranch: input.productionBranch,
        branchName,
        category: "verification-failed",
        workflowStatus: reverified.workflowStatus,
        prUrl,
        prNumber,
        advancedThisRequest: true,
        lockContended,
      });
    }
    sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
    return progressResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      lifecycle: "verifying",
      workflowStatus: reverified.workflowStatus,
      message: "Verifying workflow on the production branch.",
      prUrl,
      prNumber,
      advancedThisRequest: true,
      lockContended,
    });
  }

  if (inspection.branch !== branchName) {
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "unexpected-pr-content",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      advancedThisRequest: true,
      lockContended,
    });
  }

  try {
    assertPrBaseBranchMatches({
      prUrl,
      actualBaseBranch: inspection.baseBranch,
      expectedBaseBranch: input.productionBranch,
    });
  } catch {
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "unexpected-pr-content",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      advancedThisRequest: true,
      lockContended,
    });
  }

  if (inspection.isDraft) {
    await client.markPullRequestReadyForReview(
      parsedPr.owner,
      parsedPr.repo,
      parsedPr.pullNumber,
    );
    inspection = await inspectPullRequestForMerge(
      client,
      parsedPr,
      input.targetRepo,
    );
  }

  validatedHeadSha = inspection.headSha;
  session.lastValidatedHeadSha = validatedHeadSha;

  const filesValidationPassed = validatePullRequestFiles(
    inspection.changedFiles,
    TARGET_WORKFLOW_PATH,
  );
  if (!filesValidationPassed) {
    const recoveryResult = await attemptStaleInstallBranchRecovery({
      client,
      input,
      targetRepoSlug,
      branchName,
      productionStatus,
      intendedWorkflowContent,
      inspection,
      parsedPr,
      prUrl,
      prNumber,
      validatedHeadSha,
      session,
      lockContended,
      filesValidationPassed,
    });
    if (recoveryResult) {
      return recoveryResult;
    }
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "unexpected-pr-content",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
    });
  }

  const headWorkflowContent = await readWorkflowAtRef(
    client,
    targetRepoSlug,
    TARGET_WORKFLOW_PATH,
    inspection.headSha,
  );
  if (
    compareTargetWorkflowContent(headWorkflowContent, intendedWorkflowContent) !==
    "present"
  ) {
    const recoveryResult = await attemptStaleInstallBranchRecovery({
      client,
      input,
      targetRepoSlug,
      branchName,
      productionStatus,
      intendedWorkflowContent,
      inspection,
      parsedPr,
      prUrl,
      prNumber,
      validatedHeadSha,
      session,
      lockContended,
      filesValidationPassed: true,
    });
    if (recoveryResult) {
      return recoveryResult;
    }
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "unexpected-pr-content",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
      customMessage:
        "Workflow install PR content does not match the harness-generated workflow.",
    });
  }

  if (
    !intendedWorkflowContent.includes(harnessDispatchRepoSlug) ||
    !intendedWorkflowContent.includes(`--arg repo ${input.repoConfigId}`)
  ) {
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "unexpected-pr-content",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
    });
  }

  const loadedConfig = await loadHarnessConfig({ baseDir: options.cwd });
  const mergeMethod =
    loadedConfig.config.merge?.mergeMethod ?? DEFAULT_MERGE_METHOD;

  const checkPolicy = evaluateChecksForMerge(inspection.checks, loadedConfig.config);
  if (checkPolicy.decision === "block") {
    if (checkPolicy.classification === "checks_failing") {
      return blockedResult({
        repoConfigId: input.repoConfigId,
        targetRepo: input.targetRepo,
        targetRepoSlug,
        productionBranch: input.productionBranch,
        branchName,
        category: "checks-failing",
        workflowStatus: productionStatus.workflowStatus,
        prUrl,
        prNumber,
        validatedHeadSha,
        advancedThisRequest: true,
        lockContended,
        customMessage: redactSecretsString(checkPolicy.reason),
      });
    }
    session.checksPendingSince ??= Date.now();
    if (
      Date.now() - session.checksPendingSince >
      WORKFLOW_INSTALL_CHECK_POLL_TIMEOUT_MS
    ) {
      sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
      return blockedResult({
        repoConfigId: input.repoConfigId,
        targetRepo: input.targetRepo,
        targetRepoSlug,
        productionBranch: input.productionBranch,
        branchName,
        category: "checks-pending",
        workflowStatus: productionStatus.workflowStatus,
        prUrl,
        prNumber,
        validatedHeadSha,
        advancedThisRequest: true,
        lockContended,
        customMessage: "Timed out waiting for GitHub checks on the workflow install PR.",
      });
    }
    sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
    return progressResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      lifecycle: "waiting-for-checks",
      workflowStatus: productionStatus.workflowStatus,
      message: "Waiting for GitHub checks on the workflow install PR.",
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
      blockedCategory: "checks-pending",
    });
  }

  const mergeableState = inspection.mergeableState?.toLowerCase() ?? null;
  if (mergeableState === "unknown" || inspection.mergeable === null) {
    sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
    return progressResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      lifecycle: "waiting-for-checks",
      workflowStatus: productionStatus.workflowStatus,
      message: "Waiting for GitHub mergeability on the workflow install PR.",
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
      blockedCategory: "mergeability-pending",
    });
  }

  if (mergeableState === "behind") {
    if (session.branchUpdateAttemptedForHeadSha !== validatedHeadSha) {
      try {
        await client.updatePullRequestBranch(
          parsedPr.owner,
          parsedPr.repo,
          parsedPr.pullNumber,
          { expectedHeadSha: validatedHeadSha },
        );
        session.branchUpdateAttemptedForHeadSha = validatedHeadSha;
        sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
        return progressResult({
          repoConfigId: input.repoConfigId,
          targetRepo: input.targetRepo,
          targetRepoSlug,
          productionBranch: input.productionBranch,
          branchName,
          lifecycle: "updating-branch",
          workflowStatus: productionStatus.workflowStatus,
          message: "Updating the workflow install branch.",
          prUrl,
          prNumber,
          validatedHeadSha,
          advancedThisRequest: true,
          lockContended,
        });
      } catch (error) {
        const classified = classifyWorkflowInstallMergeRejection({ error });
        const recoveryResult = await attemptStaleInstallBranchRecovery({
          client,
          input,
          targetRepoSlug,
          branchName,
          productionStatus,
          intendedWorkflowContent,
          inspection,
          parsedPr,
          prUrl,
          prNumber,
          validatedHeadSha,
          session,
          lockContended,
          filesValidationPassed: validatePullRequestFiles(
            inspection.changedFiles,
            TARGET_WORKFLOW_PATH,
          ),
        });
        if (recoveryResult) {
          return recoveryResult;
        }
        return blockedResult({
          repoConfigId: input.repoConfigId,
          targetRepo: input.targetRepo,
          targetRepoSlug,
          productionBranch: input.productionBranch,
          branchName,
          category: classified.category,
          workflowStatus: productionStatus.workflowStatus,
          prUrl,
          prNumber,
          validatedHeadSha,
          advancedThisRequest: true,
          lockContended,
          customMessage: classified.message,
        });
      }
    }
    const recoveryResult = await attemptStaleInstallBranchRecovery({
      client,
      input,
      targetRepoSlug,
      branchName,
      productionStatus,
      intendedWorkflowContent,
      inspection,
      parsedPr,
      prUrl,
      prNumber,
      validatedHeadSha,
      session,
      lockContended,
      filesValidationPassed: validatePullRequestFiles(
        inspection.changedFiles,
        TARGET_WORKFLOW_PATH,
      ),
    });
    if (recoveryResult) {
      return recoveryResult;
    }
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "branch-behind",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
    });
  }

  if (mergeableState === "dirty" || mergeableState === "blocked") {
    const category: WorkflowInstallBlockedCategory =
      mergeableState === "blocked" ? "review-required" : "merge-conflict";
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category,
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
    });
  }

  if (inspection.mergeable === false) {
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "merge-conflict",
      workflowStatus: productionStatus.workflowStatus,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
    });
  }

  if (session.mergeAttemptedForHeadSha === validatedHeadSha) {
    sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
    return progressResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      lifecycle: "merging",
      workflowStatus: productionStatus.workflowStatus,
      message: "Waiting for workflow install PR merge to complete.",
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: false,
      lockContended,
    });
  }

  try {
    await client.mergePullRequest(
      parsedPr.owner,
      parsedPr.repo,
      parsedPr.pullNumber,
      {
        mergeMethod: mergeMethod as "squash" | "merge" | "rebase",
        commitTitle: buildTargetWorkflowPrTitle(),
        expectedHeadSha: validatedHeadSha,
      },
    );
    session.mergeAttemptedForHeadSha = validatedHeadSha;
    session.verificationStartedAt = Date.now();
    sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
  } catch (error) {
    if (isAlreadyMergedError(error)) {
      session.verificationStartedAt ??= Date.now();
      sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
    } else {
      const classified = classifyWorkflowInstallMergeRejection({
        error,
        mergeableState: inspection.mergeableState,
        message: error instanceof Error ? error.message : String(error),
      });
      if (classified.waiting) {
        sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
        return progressResult({
          repoConfigId: input.repoConfigId,
          targetRepo: input.targetRepo,
          targetRepoSlug,
          productionBranch: input.productionBranch,
          branchName,
          lifecycle:
            classified.category === "checks-pending"
              ? "waiting-for-checks"
              : "merging",
          workflowStatus: productionStatus.workflowStatus,
          message: classified.message,
          prUrl,
          prNumber,
          validatedHeadSha,
          advancedThisRequest: true,
          lockContended,
          blockedCategory: classified.category,
        });
      }
      if (error instanceof GitHubApiError && classifyMergeError(error) === "github_auth_failure") {
        return blockedResult({
          repoConfigId: input.repoConfigId,
          targetRepo: input.targetRepo,
          targetRepoSlug,
          productionBranch: input.productionBranch,
          branchName,
          category: "permission-denied",
          workflowStatus: productionStatus.workflowStatus,
          prUrl,
          prNumber,
          validatedHeadSha,
          advancedThisRequest: true,
          lockContended,
        });
      }
      return blockedResult({
        repoConfigId: input.repoConfigId,
        targetRepo: input.targetRepo,
        targetRepoSlug,
        productionBranch: input.productionBranch,
        branchName,
        category: classified.category,
        workflowStatus: productionStatus.workflowStatus,
        prUrl,
        prNumber,
        validatedHeadSha,
        advancedThisRequest: true,
        lockContended,
        customMessage: classified.message,
      });
    }
  }

  const postMergeStatus = await provider.checkTargetWorkflowStatus({
    targetRepoSlug,
    workflowPath: TARGET_WORKFLOW_PATH,
    intendedWorkflowContent,
    productionBranch: input.productionBranch,
  });

  if (postMergeStatus.workflowStatus === "present") {
    return completeResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
    });
  }

  session.verificationStartedAt ??= Date.now();
  if (
    Date.now() - session.verificationStartedAt >
    WORKFLOW_INSTALL_VERIFICATION_TIMEOUT_MS
  ) {
    sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
    return blockedResult({
      repoConfigId: input.repoConfigId,
      targetRepo: input.targetRepo,
      targetRepoSlug,
      productionBranch: input.productionBranch,
      branchName,
      category: "verification-failed",
      workflowStatus: postMergeStatus.workflowStatus,
      prUrl,
      prNumber,
      validatedHeadSha,
      advancedThisRequest: true,
      lockContended,
      customMessage:
        "Workflow install PR merged, but production verification timed out.",
    });
  }

  sessions.set(sessionKey(targetRepoSlug, input.repoConfigId), session);
  return progressResult({
    repoConfigId: input.repoConfigId,
    targetRepo: input.targetRepo,
    targetRepoSlug,
    productionBranch: input.productionBranch,
    branchName,
    lifecycle: "verifying",
    workflowStatus: postMergeStatus.workflowStatus,
    message: "Verifying workflow on the production branch.",
    prUrl,
    prNumber,
    validatedHeadSha,
    advancedThisRequest: true,
    lockContended,
    canRetry: true,
  });
}

export async function finalizeTargetWorkflowRemote(options: {
  cwd?: string;
  input: TargetWorkflowFinalizeInput;
  provider: GitHubRemoteSetupProvider;
  client: GitHubClient;
}): Promise<TargetWorkflowFinalizationResult> {
  const targetRepoSlug = targetRepoSlugFromUrl(options.input.targetRepo);
  const lockKey = buildFinalizationLockKey(
    targetRepoSlug ?? options.input.targetRepo,
    options.input.repoConfigId,
  );

  const { result, lockContended } = await withTargetWorkflowFinalizationLock(
    lockKey,
    async () =>
      advanceTargetWorkflowFinalizationStep({
        cwd: options.cwd,
        input: options.input,
        provider: options.provider,
        client: options.client,
        lockContended: false,
      }),
  );

  return {
    ...result,
    lockContended: lockContended || result.lockContended,
  };
}

export function resetTargetWorkflowFinalizationSessionsForTests(): void {
  sessions.clear();
}
