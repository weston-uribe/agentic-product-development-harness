import {
  readControlPlaneSetupState,
  updateControlPlaneSetupState,
} from "./control-plane-setup-state.js";
import type {
  ControlPlaneSetupState,
  VercelBridgeRedeployVerification,
  VercelBridgeRedeployVerificationStatus,
  VercelBridgeSelection,
} from "./control-plane-types.js";
import { assessGitHubDispatchTokenEligibility } from "./github-dispatch-token.js";
import { inspectProductionRedeployStatus } from "./vercel-production-redeploy.js";
import { SETUP_PERMISSIONS } from "./permission-model.js";
import { loadSecretFromEnvLocal } from "./service-verification.js";
import {
  applyVercelBridgeSetup,
  type VercelBridgeApplyResult,
  type VercelBridgeOrchestrationStep,
  type VercelBridgePlanInput,
  type VercelBridgeSetupBlocked,
} from "./vercel-setup-apply.js";
import {
  normalizeVercelBridgePlanInput,
  previewVercelBridgeSetup,
} from "./vercel-setup-plan.js";
import { logVercelBridgeEvent } from "./vercel-bridge-structured-log.js";

function buildPersistedContextMismatchBlocked(): VercelBridgeSetupBlocked {
  return {
    message:
      "Persisted Step 3 setup context no longer matches the in-progress redeploy verification.",
    nextSteps: [
      "Use Apply Vercel Settings again to regenerate preview and restart verification.",
      "If the problem persists, confirm team and project selections match the original apply.",
    ],
  };
}

function buildMissingPollCredentialsBlocked(missing: string): VercelBridgeSetupBlocked {
  return {
    message: `Cannot resume redeploy verification because ${missing} is missing from saved setup.`,
    nextSteps: [
      "Return to Step 1 and save the required token in .env.local.",
      "Then use Apply Vercel Settings again to restart verification.",
    ],
  };
}

export async function buildPollVerifyPlanInputFromPersistedState(input: {
  cwd?: string;
  state: ControlPlaneSetupState;
  pending: VercelBridgeRedeployVerification;
}): Promise<
  | { ok: true; plan: VercelBridgePlanInput; vercelToken: string }
  | { ok: false; setupBlocked: VercelBridgeSetupBlocked }
> {
  const vercel = input.state.vercel;
  if (!vercel) {
    return {
      ok: false,
      setupBlocked: buildMissingPollCredentialsBlocked("saved Vercel selection"),
    };
  }

  const vercelToken = (await loadSecretFromEnvLocal({ cwd: input.cwd, key: "VERCEL_TOKEN" })) ?? "";
  if (!vercelToken.trim()) {
    return {
      ok: false,
      setupBlocked: buildMissingPollCredentialsBlocked("VERCEL_TOKEN"),
    };
  }

  const linearApiKey = await loadSecretFromEnvLocal({ cwd: input.cwd, key: "LINEAR_API_KEY" });
  const githubToken = await loadSecretFromEnvLocal({ cwd: input.cwd, key: "GITHUB_TOKEN" });
  const dispatchEligibility = await assessGitHubDispatchTokenEligibility({
    githubToken,
    cwd: input.cwd,
  });

  const teamId = input.pending.teamId ?? vercel.teamId;
  const projectId = input.pending.projectId;
  const projectName = input.pending.projectName;

  const savedWebhookSecret = await loadSecretFromEnvLocal({
    cwd: input.cwd,
    key: "LINEAR_WEBHOOK_SECRET",
  });
  const preserveGeneratedFingerprint =
    input.pending.candidateSecretSource === "generated" ||
    input.pending.candidateSecretSource === "unreadable" ||
    Boolean(savedWebhookSecret?.trim());

  const plan = normalizeVercelBridgePlanInput({
    vercelToken,
    linearApiKey,
    teamId,
    projectId,
    projectName,
    team: {
      mode: "existing",
      teamId: teamId ?? "",
    },
    project: {
      mode: "existing",
      projectId,
      projectName,
    },
    linearTeamId: input.state.linear?.teamId,
    derivedHarnessTeamKey: input.state.linear?.teamKey,
    derivedGithubDispatchToken:
      dispatchEligibility.eligible && githubToken ? githubToken : undefined,
    willGenerateLinearWebhookSecret: preserveGeneratedFingerprint
      ? true
      : !savedWebhookSecret?.trim(),
    verificationLinearWebhookSecret: savedWebhookSecret,
    preserveGeneratedWebhookSecretFingerprint: preserveGeneratedFingerprint,
  });

  return { ok: true, plan, vercelToken };
}

export async function reconstructPollVerifyPreviewForDiagnostics(input: {
  cwd?: string;
  state: ControlPlaneSetupState;
  pending: VercelBridgeRedeployVerification;
}): Promise<
  | {
      ok: true;
      plan: VercelBridgePlanInput;
      vercelToken: string;
      preview: Awaited<ReturnType<typeof previewVercelBridgeSetup>>;
      fingerprintMatch: boolean;
    }
  | { ok: false; setupBlocked: VercelBridgeSetupBlocked }
> {
  const built = await buildPollVerifyPlanInputFromPersistedState(input);
  if (!built.ok) {
    return built;
  }

  const preview = await previewVercelBridgeSetup(built.plan);
  return {
    ok: true,
    plan: built.plan,
    vercelToken: built.vercelToken,
    preview,
    fingerprintMatch: preview.fingerprint === input.pending.fingerprint,
  };
}

export async function buildPollVerifyPlanFromPersistedState(input: {
  cwd?: string;
  state: ControlPlaneSetupState;
  pending: VercelBridgeRedeployVerification;
}): Promise<
  | { ok: true; plan: VercelBridgePlanInput; vercelToken: string }
  | { ok: false; setupBlocked: VercelBridgeSetupBlocked }
> {
  const built = await buildPollVerifyPlanInputFromPersistedState(input);
  if (!built.ok) {
    return built;
  }

  const preview = await previewVercelBridgeSetup(built.plan);
  if (preview.fingerprint !== input.pending.fingerprint) {
    logVercelBridgeEvent({
      phase: "poll_reconstruct",
      actionId: input.pending.actionId,
      expectedFingerprint: input.pending.fingerprint,
      reconstructedFingerprint: preview.fingerprint,
      fingerprintMatch: false,
      projectId: input.pending.projectId,
      projectName: input.pending.projectName,
      teamId: input.pending.teamId,
    });
    return {
      ok: false,
      setupBlocked: buildPersistedContextMismatchBlocked(),
    };
  }

  return { ok: true, plan: built.plan, vercelToken: built.vercelToken };
}

const verifyClaimInFlight = new Set<string>();

function verifyClaimKey(actionId: string, cwd?: string): string {
  return `${cwd ?? "default"}:${actionId}`;
}
const TERMINAL_REDEPLOY_STATUSES = new Set<VercelBridgeRedeployVerificationStatus>([
  "failed",
  "timeout",
  "no_source_deployment",
  "verify_failed",
  "verified",
]);

function buildSetupBlockedForPostRedeployVerificationFailure(input?: {
  retryReason?: string;
}): VercelBridgeSetupBlocked {
  const reasonSuffix = input?.retryReason?.trim()
    ? ` (${input.retryReason})`
    : "";
  return {
    message: `Production redeploy completed, but signed webhook delivery verification still failed${reasonSuffix}.`,
    nextSteps: [
      "Use Retry verification without rewriting env vars or rotating secrets.",
      "If verification still fails, confirm the Linear webhook signing secret matches Vercel production.",
    ],
  };
}

function buildManualRedeployRecoveryMessage(
  status: VercelBridgeRedeployVerificationStatus,
  message?: string,
): string {
  if (status === "timeout") {
    return (
      message ??
      "Automatic production redeploy timed out before READY. Redeploy production in Vercel, then use Retry verification."
    );
  }
  if (status === "failed") {
    return (
      message ??
      "Automatic production redeploy failed. Redeploy production in Vercel, then use Retry verification."
    );
  }
  return "Redeploy production in Vercel, then use Retry verification (this will not rotate secrets or rewrite env vars).";
}

function mapRedeployStatusToProductionStatus(
  status: VercelBridgeRedeployVerificationStatus,
): VercelBridgeApplyResult["productionRedeployStatus"] {
  switch (status) {
    case "triggered":
      return "triggered";
    case "building":
      return "building";
    case "ready":
    case "verified":
      return "ready";
    case "failed":
      return "failed";
    case "timeout":
      return "timeout";
    case "no_source_deployment":
      return "no_source_deployment";
    case "verify_failed":
      return "ready";
    default:
      return "not_triggered";
  }
}

function buildOrchestrationSteps(input: {
  pending?: VercelBridgeRedeployVerification;
  apply?: VercelBridgeApplyResult;
}): VercelBridgeOrchestrationStep[] {
  const steps: VercelBridgeOrchestrationStep[] = [
    {
      phase: "writing_env_vars",
      status: "completed",
      message: "Writing Vercel env vars…",
    },
  ];

  if (!input.pending) {
    return steps;
  }

  if (input.pending.status === "no_source_deployment") {
    steps.push({
      phase: "redeploying_production",
      status: "failed",
      message:
        input.pending.message ??
        "No READY production deployment was found to redeploy after env var changes.",
    });
    return steps;
  }

  steps.push({
    phase: "redeploying_production",
    status:
      input.pending.status === "failed" || input.pending.status === "timeout"
        ? "failed"
        : input.pending.status === "verified" ||
            input.pending.status === "ready" ||
            input.pending.status === "verify_failed"
          ? "completed"
          : "completed",
    message:
      input.pending.status === "building" || input.pending.status === "triggered"
        ? "Waiting for Vercel deployment READY…"
        : "Redeploying production so new env vars take effect…",
  });

  if (
    input.pending.status === "verify_failed" ||
    input.pending.status === "verified" ||
    input.apply?.verificationRetry
  ) {
    steps.push({
      phase: "verifying_webhook",
      status:
        input.pending.status === "verified" || input.apply?.signedProbeVerified
          ? "completed"
          : "failed",
      message: "Retrying signed webhook verification…",
    });
  }

  return steps;
}

function buildApplyResultFromState(input: {
  vercel: VercelBridgeSelection;
  pending?: VercelBridgeRedeployVerification;
  retryApply?: VercelBridgeApplyResult;
  setupBlocked?: VercelBridgeSetupBlocked;
}): VercelBridgeApplyResult {
  const pending = input.pending ?? input.vercel.redeployVerification;
  const retryApply = input.retryApply;
  const productionRedeployTriggered = Boolean(pending);
  const productionRedeployStatus = pending
    ? mapRedeployStatusToProductionStatus(pending.status)
    : "not_triggered";

  const setupBlocked =
    input.setupBlocked ??
    (pending?.blockedMessage
      ? {
          message: pending.blockedMessage,
          nextSteps: pending.blockedNextSteps ?? [],
        }
      : undefined);

  const signedProbeInitialResult = input.vercel.signedProbe;
  const signedProbeRetryResult = retryApply?.signedProbe;
  const signedProbeVerified =
    retryApply?.signedProbeVerified ?? input.vercel.signedProbeVerified ?? false;

  return {
    actionId: pending?.actionId ?? "vercel-bridge-apply",
    status: "applied",
    projectId: input.vercel.projectId,
    projectName: input.vercel.projectName,
    writtenEnvKeys: input.pending?.writtenEnvKeys ?? [],
    skippedEnvKeys: input.pending?.skippedEnvKeys ?? [],
    linearWebhookSetup: retryApply?.linearWebhookSetup ?? {
      mode: "automated",
      manualSteps: [],
    },
    signedProbeVerified,
    signedProbeReason:
      retryApply?.signedProbeReason ?? signedProbeInitialResult?.reason,
    signedProbe: signedProbeRetryResult ?? signedProbeInitialResult,
    deploymentRedeployRequired: input.vercel.deploymentRedeployRequired ?? false,
    verificationRetry: retryApply?.verificationRetry,
    verified: retryApply?.verified ?? signedProbeVerified,
    fingerprint: pending?.fingerprint ?? input.vercel.appliedFingerprint ?? "",
    permission: retryApply?.permission ?? SETUP_PERMISSIONS.remoteSecretWrite,
    envVarsWritten: true,
    signedProbeInitialResult,
    signedProbeRetryResult,
    productionRedeployTriggered,
    productionRedeployStatus,
    setupBlocked,
    setupPending: pending ? !TERMINAL_REDEPLOY_STATUSES.has(pending.status) : false,
    pollActionId: pending?.actionId,
    orchestrationSteps: buildOrchestrationSteps({ pending, apply: retryApply }),
  };
}

async function claimVerifyAttempt(input: {
  cwd?: string;
  pending: VercelBridgeRedeployVerification;
}): Promise<VercelBridgeRedeployVerification | null> {
  const claimKey = verifyClaimKey(input.pending.actionId, input.cwd);
  if (verifyClaimInFlight.has(claimKey)) {
    return null;
  }
  verifyClaimInFlight.add(claimKey);

  const state = await readControlPlaneSetupState(input.cwd);
  const current = state?.vercel?.redeployVerification;
  if (!current || current.actionId !== input.pending.actionId) {
    verifyClaimInFlight.delete(claimKey);
    return null;
  }
  if (current.verifyAttempted) {
    verifyClaimInFlight.delete(claimKey);
    return null;
  }

  const nextPending: VercelBridgeRedeployVerification = {
    ...current,
    verifyAttempted: true,
    updatedAt: new Date().toISOString(),
    status: "ready",
  };

  await updateControlPlaneSetupState(
    {
      vercel: {
        ...state!.vercel!,
        redeployVerification: nextPending,
      },
    },
    input.cwd,
  );

  return nextPending;
}

async function finalizePendingState(input: {
  cwd?: string;
  pending: VercelBridgeRedeployVerification;
  status: VercelBridgeRedeployVerificationStatus;
  message?: string;
  setupBlocked?: VercelBridgeSetupBlocked;
  clearPending?: boolean;
  vercelPatch?: Partial<VercelBridgeSelection>;
}): Promise<void> {
  const state = await readControlPlaneSetupState(input.cwd);
  if (!state?.vercel) {
    return;
  }

  const completedAt = new Date().toISOString();
  const nextPending: VercelBridgeRedeployVerification = {
    ...input.pending,
    status: input.status,
    updatedAt: completedAt,
    completedAt,
    message: input.message ?? input.pending.message,
    blockedMessage: input.setupBlocked?.message,
    blockedNextSteps: input.setupBlocked?.nextSteps,
  };

  await updateControlPlaneSetupState(
    {
      vercel: {
        ...state.vercel,
        ...input.vercelPatch,
        redeployVerification: input.clearPending ? undefined : nextPending,
      },
    },
    input.cwd,
  );
}

export async function pollVercelBridgeRedeployVerification(input: {
  actionId?: string;
  cwd?: string;
}): Promise<VercelBridgeApplyResult> {
  const state = await readControlPlaneSetupState(input.cwd);
  const vercel = state?.vercel;
  const pending = vercel?.redeployVerification;

  if (!vercel || !pending) {
    throw new Error("No pending Vercel redeploy verification is in progress.");
  }

  if (input.actionId && pending.actionId !== input.actionId) {
    throw new Error("Pending Vercel redeploy verification action was not found.");
  }

  if (TERMINAL_REDEPLOY_STATUSES.has(pending.status)) {
    logVercelBridgeEvent({
      phase: "poll",
      actionId: pending.actionId,
      pollStatus: pending.status,
      verifyAttempted: pending.verifyAttempted,
      projectId: pending.projectId,
      projectName: pending.projectName,
      teamId: pending.teamId,
      fingerprint: pending.fingerprint,
      setupBlockedMessage: pending.blockedMessage,
    });
    return buildApplyResultFromState({
      vercel,
      pending,
      setupBlocked: pending.blockedMessage
        ? {
            message: pending.blockedMessage,
            nextSteps: pending.blockedNextSteps ?? [],
          }
        : undefined,
    });
  }

  if (!pending.newDeploymentId) {
    throw new Error("Pending Vercel redeploy verification is missing deployment id.");
  }

  const persistedPlan = await buildPollVerifyPlanFromPersistedState({
    cwd: input.cwd,
    state: state!,
    pending,
  });

  if (!persistedPlan.ok) {
    logVercelBridgeEvent({
      phase: "blocked",
      actionId: pending.actionId,
      pollStatus: "verify_failed",
      setupBlockedMessage: persistedPlan.setupBlocked.message,
      setupBlockedNextSteps: persistedPlan.setupBlocked.nextSteps,
      projectId: pending.projectId,
      fingerprint: pending.fingerprint,
    });
    const terminalPending: VercelBridgeRedeployVerification = {
      ...pending,
      status: "verify_failed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      message: persistedPlan.setupBlocked.message,
      blockedMessage: persistedPlan.setupBlocked.message,
      blockedNextSteps: persistedPlan.setupBlocked.nextSteps,
    };

    await updateControlPlaneSetupState(
      {
        vercel: {
          ...vercel,
          redeployVerification: terminalPending,
        },
      },
      input.cwd,
    );

    return buildApplyResultFromState({
      vercel: { ...vercel, redeployVerification: terminalPending },
      pending: terminalPending,
      setupBlocked: persistedPlan.setupBlocked,
    });
  }

  const inspectResult = await inspectProductionRedeployStatus({
    vercelToken: persistedPlan.vercelToken,
    newDeploymentId: pending.newDeploymentId,
    teamId: pending.teamId,
    sourceDeploymentId: pending.sourceDeploymentId,
    deadlineAt: pending.deadlineAt,
  });

  if (inspectResult.status === "failed" || inspectResult.status === "timeout") {
    const setupBlocked = {
      message: buildManualRedeployRecoveryMessage(
        inspectResult.status,
        inspectResult.message,
      ),
      nextSteps: [
        "Redeploy production in Vercel manually if needed.",
        "Use Retry verification without rewriting env vars or rotating secrets.",
      ],
    };

    logVercelBridgeEvent({
      phase: "blocked",
      actionId: pending.actionId,
      pollStatus: inspectResult.status,
      setupBlockedMessage: setupBlocked.message,
      setupBlockedNextSteps: setupBlocked.nextSteps,
      projectId: pending.projectId,
      fingerprint: pending.fingerprint,
    });

    const terminalPending: VercelBridgeRedeployVerification = {
      ...pending,
      status: inspectResult.status,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      message: inspectResult.message,
      blockedMessage: setupBlocked.message,
      blockedNextSteps: setupBlocked.nextSteps,
    };

    await updateControlPlaneSetupState(
      {
        vercel: {
          ...vercel,
          redeployVerification: terminalPending,
        },
      },
      input.cwd,
    );

    return buildApplyResultFromState({
      vercel: { ...vercel, redeployVerification: terminalPending },
      pending: terminalPending,
      setupBlocked,
    });
  }

  if (inspectResult.status === "building" || inspectResult.status === "triggered") {
    logVercelBridgeEvent({
      phase: "poll",
      actionId: pending.actionId,
      pollStatus: inspectResult.status,
      verifyAttempted: pending.verifyAttempted,
      projectId: pending.projectId,
      fingerprint: pending.fingerprint,
    });
    const buildingPending: VercelBridgeRedeployVerification = {
      ...pending,
      status: "building",
      updatedAt: new Date().toISOString(),
      message: inspectResult.message,
    };

    await updateControlPlaneSetupState(
      {
        vercel: {
          ...vercel,
          redeployVerification: buildingPending,
        },
      },
      input.cwd,
    );

    return buildApplyResultFromState({
      vercel: { ...vercel, redeployVerification: buildingPending },
      pending: buildingPending,
    });
  }

  if (inspectResult.status !== "ready") {
    return buildApplyResultFromState({ vercel, pending });
  }

  if (pending.verifyAttempted) {
    return buildApplyResultFromState({ vercel, pending });
  }

  const claimed = await claimVerifyAttempt({ cwd: input.cwd, pending });
  if (!claimed) {
    const latest = await readControlPlaneSetupState(input.cwd);
    return buildApplyResultFromState({
      vercel: latest!.vercel!,
      pending: latest!.vercel!.redeployVerification,
    });
  }

  logVercelBridgeEvent({
    phase: "verify_retry",
    actionId: claimed.actionId,
    pollStatus: "ready",
    verifyAttempted: true,
    verifyOnly: true,
    projectId: claimed.projectId,
    fingerprint: claimed.fingerprint,
    candidateSecretSource: claimed.candidateSecretSource,
  });

  const retryResult = await applyVercelBridgeSetup({
    plan: persistedPlan.plan,
    confirmed: true,
    fingerprint: pending.fingerprint,
    verifyOnly: true,
    cwd: input.cwd,
  });

  if (retryResult.signedProbeVerified && retryResult.verified) {
    logVercelBridgeEvent({
      phase: "signed_probe",
      actionId: claimed.actionId,
      pollStatus: "verified",
      signedProbeResult: retryResult.signedProbe?.result,
      signedProbeReason: retryResult.signedProbeReason,
      signedProbeStatusCode: retryResult.signedProbe?.statusCode,
      fingerprint: claimed.fingerprint,
    });
    await finalizePendingState({
      cwd: input.cwd,
      pending: claimed,
      status: "verified",
      message: "Signed webhook verification passed after production redeploy.",
      clearPending: true,
      vercelPatch: {
        signedProbeVerified: true,
        signedProbe: retryResult.signedProbe,
        deploymentRedeployRequired: false,
      },
    });

    const latest = await readControlPlaneSetupState(input.cwd);
    return buildApplyResultFromState({
      vercel: latest!.vercel!,
      pending: {
        ...claimed,
        status: "verified",
        completedAt: new Date().toISOString(),
      },
      retryApply: retryResult,
    });
  }

  const setupBlocked = buildSetupBlockedForPostRedeployVerificationFailure({
    retryReason: retryResult.signedProbeReason,
  });

  logVercelBridgeEvent({
    phase: "blocked",
    actionId: claimed.actionId,
    pollStatus: "verify_failed",
    signedProbeResult: retryResult.signedProbe?.result,
    signedProbeReason: retryResult.signedProbeReason,
    signedProbeStatusCode: retryResult.signedProbe?.statusCode,
    setupBlockedMessage: setupBlocked.message,
    setupBlockedNextSteps: setupBlocked.nextSteps,
    fingerprint: claimed.fingerprint,
  });

  await finalizePendingState({
    cwd: input.cwd,
    pending: claimed,
    status: "verify_failed",
    message: setupBlocked.message,
    setupBlocked,
    vercelPatch: {
      signedProbeVerified: false,
      signedProbe: retryResult.signedProbe,
      deploymentRedeployRequired: true,
    },
  });

  const latest = await readControlPlaneSetupState(input.cwd);
  return buildApplyResultFromState({
    vercel: latest!.vercel!,
    pending: latest!.vercel!.redeployVerification,
    retryApply: { ...retryResult, verificationRetry: true },
    setupBlocked,
  });
}