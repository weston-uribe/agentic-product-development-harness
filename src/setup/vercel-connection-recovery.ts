import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  readControlPlaneSetupState,
  updateControlPlaneSetupState,
} from "./control-plane-setup-state.js";
import { reconcileInitialSetupCompletion } from "./initial-setup-lifecycle.js";
import { loadSecretFromEnvLocal } from "./service-verification.js";
import { resolveLocalFilePaths } from "./setup-state.js";
import { verifySetupService } from "./service-verification.js";
import { classifyVerificationFailure } from "./credential-health.js";
import { deterministicBridgeProjectName } from "./vercel-bridge-identity.js";
import {
  reconcileVercelControlPlaneFromRemote,
  type VercelBridgeReconcileResult,
} from "./vercel-bridge-reconcile.js";
import {
  previewVercelBridgeSetup,
  type VercelBridgePlanInput,
} from "./vercel-setup-plan.js";
import {
  applyVercelBridgeSetup,
  type VercelBridgeApplyResult,
} from "./vercel-setup-apply.js";
import { pollVercelBridgeRedeployVerification } from "./vercel-bridge-redeploy-poll.js";
import { listVercelTeams, type VercelTeamSummary } from "./vercel-setup-client.js";
import { assessDurableBridgeHealth } from "./workspace-entry.js";
import type { SetupGuiViewModel } from "./gui-view-model.js";
import type { RemoteSetupSummary } from "./remote-setup-summary.js";
import type {
  VercelRecoveryNextAction,
  VercelRecoveryOperation,
  VercelRecoveryPublicStatus,
  VercelRecoveryScopeOption,
  VercelRecoveryStage,
} from "./vercel-connection-recovery-types.js";

export type {
  VercelRecoveryNextAction,
  VercelRecoveryOperation,
  VercelRecoveryPublicStatus,
  VercelRecoveryScopeOption,
  VercelRecoveryStage,
} from "./vercel-connection-recovery-types.js";
export { vercelRecoveryStageLabel } from "./vercel-connection-recovery-types.js";

function applyResultProblem(result: VercelBridgeApplyResult): string {
  return (
    result.setupBlocked?.message ??
    result.orchestrationStatusMessage ??
    result.signedProbeReason ??
    result.signedProbe?.reason ??
    "Bridge apply finished without full verification."
  );
}

function applyLinearWebhookOk(result: VercelBridgeApplyResult): boolean {
  return result.linearWebhookSetup?.mode === "automated";
}

const OPERATION_FILE = "vercel-connection-recovery.json";
const STALE_MS = 30 * 60 * 1000;
const STAGE_ORDER: VercelRecoveryStage[] = [
  "verifying_vercel",
  "preparing_bridge",
  "deploying_bridge",
  "verifying_webhook",
  "connecting_linear",
  "ready",
];

function operationPath(cwd?: string): string {
  const paths = resolveLocalFilePaths(cwd);
  return path.join(paths.harnessDir, OPERATION_FILE);
}

async function readOperation(
  cwd?: string,
): Promise<VercelRecoveryOperation | null> {
  const filePath = operationPath(cwd);
  try {
    await access(filePath);
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as VercelRecoveryOperation;
    if (!parsed.operationId || !parsed.stage) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeOperation(
  operation: VercelRecoveryOperation,
  cwd?: string,
): Promise<VercelRecoveryOperation> {
  const paths = resolveLocalFilePaths(cwd);
  await mkdir(paths.harnessDir, { recursive: true });
  const filePath = operationPath(cwd);
  const next = { ...operation, updatedAt: new Date().toISOString() };
  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
  return next;
}

function isComplete(operation: VercelRecoveryOperation): boolean {
  return operation.stage === "ready" && Boolean(operation.completedAt);
}

function isStale(operation: VercelRecoveryOperation): boolean {
  if (isComplete(operation)) {
    return false;
  }
  // Failed ops are reusable for retry; only in-flight ops become stale.
  if (operation.stage === "failed" || operation.stage === "needs_scope") {
    return false;
  }
  const updated = Date.parse(operation.updatedAt);
  if (Number.isNaN(updated)) {
    return true;
  }
  return Date.now() - updated > STALE_MS;
}

function failOperation(
  operation: VercelRecoveryOperation,
  input: {
    stage: VercelRecoveryStage;
    humanProblem: string;
    nextAction: VercelRecoveryNextAction;
    retrySafe: boolean;
    remoteMutationsOccurred?: boolean;
  },
): VercelRecoveryOperation {
  return {
    ...operation,
    stage: "failed",
    failureReason: input.humanProblem,
    humanProblem: input.humanProblem,
    nextAction: input.nextAction,
    retrySafe: input.retrySafe,
    remoteMutationsOccurred:
      input.remoteMutationsOccurred ?? operation.remoteMutationsOccurred,
  };
}

function markSuccess(
  operation: VercelRecoveryOperation,
  stage: Exclude<VercelRecoveryStage, "failed" | "needs_scope">,
  patch?: Partial<VercelRecoveryOperation>,
): VercelRecoveryOperation {
  return {
    ...operation,
    ...patch,
    stage,
    lastSuccessfulStage: stage,
    failureReason: undefined,
    humanProblem: undefined,
    nextAction: "none",
    retrySafe: true,
  };
}

async function listScopeOptions(
  vercelToken: string,
  listTeams: typeof listVercelTeams,
): Promise<VercelRecoveryScopeOption[]> {
  const teams = await listTeams(vercelToken);
  return [
    { teamId: undefined, teamName: "Personal account" },
    ...teams.map((team: VercelTeamSummary) => ({
      teamId: team.id,
      teamName: team.name,
    })),
  ];
}

export type VercelRecoveryDependencies = {
  verifyToken?: typeof verifySetupService;
  reconcile?: typeof reconcileVercelControlPlaneFromRemote;
  preview?: typeof previewVercelBridgeSetup;
  apply?: typeof applyVercelBridgeSetup;
  poll?: typeof pollVercelBridgeRedeployVerification;
  listTeams?: typeof listVercelTeams;
  loadVercelToken?: (cwd?: string) => Promise<string | undefined>;
  loadLinearApiKey?: (cwd?: string) => Promise<string | undefined>;
  loadSetupSummary?: (cwd?: string) => Promise<SetupGuiViewModel>;
  loadRemoteSummary?: (cwd?: string) => Promise<RemoteSetupSummary>;
  reconcileCompletion?: typeof reconcileInitialSetupCompletion;
};

/**
 * Start or resume the single active Vercel recovery operation for a workspace.
 * Duplicate starts reuse the same operation when still active.
 */
export async function startVercelConnectionRecovery(input: {
  cwd?: string;
  selectedScope?: { teamId?: string; teamName: string };
  deps?: VercelRecoveryDependencies;
}): Promise<VercelRecoveryPublicStatus> {
  const existing = await readOperation(input.cwd);
  // Reuse the active (or failed/retryable) operation. Only a completed ready
  // operation starts fresh — duplicate starts must not create another op.
  if (existing && !isComplete(existing) && !isStale(existing)) {
    return advanceVercelConnectionRecovery({
      cwd: input.cwd,
      operationId: existing.operationId,
      selectedScope: input.selectedScope ?? existing.selectedScope,
      deps: input.deps,
    });
  }

  const now = new Date().toISOString();
  const operation: VercelRecoveryOperation = {
    operationId: randomUUID(),
    stage: "verifying_vercel",
    intendedBridgeProjectName: deterministicBridgeProjectName(input.cwd),
    selectedScope: input.selectedScope,
    remoteMutationsOccurred: false,
    retrySafe: true,
    nextAction: "none",
    createdAt: now,
    updatedAt: now,
    leaseExpiresAt: new Date(Date.now() + STALE_MS).toISOString(),
  };
  await writeOperation(operation, input.cwd);
  return advanceVercelConnectionRecovery({
    cwd: input.cwd,
    operationId: operation.operationId,
    selectedScope: input.selectedScope,
    deps: input.deps,
  });
}

export async function getVercelConnectionRecoveryStatus(input: {
  cwd?: string;
  operationId?: string;
}): Promise<VercelRecoveryPublicStatus> {
  const operation = await readOperation(input.cwd);
  if (
    input.operationId &&
    operation &&
    operation.operationId !== input.operationId
  ) {
    throw new Error("Recovery operation ID does not match the active operation.");
  }
  const state = await readControlPlaneSetupState(input.cwd);
  const bridgeHealth = assessDurableBridgeHealth(state);
  return {
    operation,
    bridgeHealth,
    initialSetupComplete: state?.initialSetup?.status === "complete",
    redirectToWorkflow:
      operation?.stage === "ready" &&
      state?.initialSetup?.status === "complete",
    completionEvidence: state?.initialSetup?.completionEvidence,
  };
}

export async function advanceVercelConnectionRecovery(input: {
  cwd?: string;
  operationId: string;
  selectedScope?: { teamId?: string; teamName: string };
  deps?: VercelRecoveryDependencies;
}): Promise<VercelRecoveryPublicStatus> {
  const deps = input.deps ?? {};
  const verifyToken = deps.verifyToken ?? verifySetupService;
  const reconcile = deps.reconcile ?? reconcileVercelControlPlaneFromRemote;
  const preview = deps.preview ?? previewVercelBridgeSetup;
  const apply = deps.apply ?? applyVercelBridgeSetup;
  const poll = deps.poll ?? pollVercelBridgeRedeployVerification;
  const loadVercelToken =
    deps.loadVercelToken ??
    ((cwd?: string) => loadSecretFromEnvLocal({ cwd, key: "VERCEL_TOKEN" }));
  const loadLinearApiKey =
    deps.loadLinearApiKey ??
    ((cwd?: string) => loadSecretFromEnvLocal({ cwd, key: "LINEAR_API_KEY" }));
  const listTeamsFn = deps.listTeams ?? listVercelTeams;

  let operation = await readOperation(input.cwd);
  if (!operation || operation.operationId !== input.operationId) {
    throw new Error("Recovery operation ID does not match the active operation.");
  }

  if (input.selectedScope) {
    operation = await writeOperation(
      {
        ...operation,
        selectedScope: input.selectedScope,
        stage:
          operation.stage === "needs_scope" || operation.stage === "failed"
            ? "preparing_bridge"
            : operation.stage,
        nextAction: "none",
        failureReason: undefined,
        humanProblem: undefined,
      },
      input.cwd,
    );
  }

  // Resume from last verified stage on retry after failure.
  if (operation.stage === "failed" && operation.lastSuccessfulStage) {
    const resumeIndex = STAGE_ORDER.indexOf(operation.lastSuccessfulStage);
    const nextStage =
      resumeIndex >= 0 && resumeIndex < STAGE_ORDER.length - 1
        ? STAGE_ORDER[resumeIndex + 1]!
        : operation.lastSuccessfulStage;
    operation = await writeOperation(
      {
        ...operation,
        stage: nextStage === "ready" ? "verifying_webhook" : nextStage,
        failureReason: undefined,
        humanProblem: undefined,
        nextAction: "none",
        retrySafe: true,
      },
      input.cwd,
    );
  } else if (operation.stage === "failed") {
    operation = await writeOperation(
      {
        ...operation,
        stage: "verifying_vercel",
        failureReason: undefined,
        humanProblem: undefined,
        nextAction: "none",
      },
      input.cwd,
    );
  }

  try {
    // Stage: verifying_vercel
    if (
      operation.stage === "verifying_vercel" ||
      !operation.lastSuccessfulStage
    ) {
      operation = await writeOperation(
        { ...operation, stage: "verifying_vercel" },
        input.cwd,
      );
      const token = (await loadVercelToken(input.cwd))?.trim();
      if (!token) {
        operation = await writeOperation(
          failOperation(operation, {
            stage: "verifying_vercel",
            humanProblem: "Vercel token is missing. Paste a valid token to reconnect.",
            nextAction: "enter_different_token",
            retrySafe: true,
          }),
          input.cwd,
        );
        return toPublicStatus(operation, input.cwd);
      }
      const verified = await verifyToken({
        cwd: input.cwd,
        service: "vercel",
        token,
      });
      if (verified.status !== "connected") {
        const health = classifyVerificationFailure(verified);
        operation = await writeOperation(
          failOperation(operation, {
            stage: "verifying_vercel",
            humanProblem: verified.message,
            nextAction:
              health === "unauthorized"
                ? "enter_different_token"
                : "retry_recovery",
            retrySafe: true,
          }),
          input.cwd,
        );
        return toPublicStatus(operation, input.cwd);
      }
      operation = await writeOperation(
        markSuccess(operation, "verifying_vercel"),
        input.cwd,
      );
    }

    // Scope selection before creating anything
    const token = (await loadVercelToken(input.cwd))?.trim() ?? "";
    const scopes = await listScopeOptions(token, listTeamsFn);
    if (!operation.selectedScope && scopes.length > 1) {
      // Personal + teams — require explicit choice when more than personal alone
      // with at least one team, or when multiple teams exist.
      const teamScopes = scopes.filter((scope) => scope.teamId);
      if (teamScopes.length >= 1) {
        operation = await writeOperation(
          {
            ...operation,
            stage: "needs_scope",
            scopeOptions: scopes,
            nextAction: "select_scope",
            humanProblem:
              "Select a Vercel scope before PDev prepares the automation bridge.",
            retrySafe: true,
          },
          input.cwd,
        );
        return toPublicStatus(operation, input.cwd);
      }
    }
    if (!operation.selectedScope) {
      operation = await writeOperation(
        {
          ...operation,
          selectedScope: { teamName: "Personal account" },
        },
        input.cwd,
      );
    }

    // Stage: preparing_bridge — discover marked bridge or create dedicated
    if (
      operation.stage === "preparing_bridge" ||
      operation.lastSuccessfulStage === "verifying_vercel" ||
      operation.stage === "needs_scope"
    ) {
      if (operation.stage === "needs_scope") {
        return toPublicStatus(operation, input.cwd);
      }
      operation = await writeOperation(
        { ...operation, stage: "preparing_bridge" },
        input.cwd,
      );

      const state = await readControlPlaneSetupState(input.cwd);
      let reconcileResult: VercelBridgeReconcileResult | null = null;

      if (!state?.vercel?.projectId?.trim()) {
        reconcileResult = await reconcile({ cwd: input.cwd });
        if (reconcileResult.status === "ambiguous") {
          operation = await writeOperation(
            failOperation(operation, {
              stage: "preparing_bridge",
              humanProblem:
                "Multiple PDev-marked bridge projects were found. Choose the correct scope or remove extras in Vercel, then retry.",
              nextAction: "select_scope",
              retrySafe: true,
            }),
            input.cwd,
          );
          operation = await writeOperation(
            {
              ...operation,
              stage: "needs_scope",
              scopeOptions: scopes,
              nextAction: "select_scope",
            },
            input.cwd,
          );
          return toPublicStatus(operation, input.cwd);
        }
      }

      const afterReconcile = await readControlPlaneSetupState(input.cwd);
      if (
        afterReconcile?.vercel?.projectId?.trim() &&
        afterReconcile.vercel.signedProbeVerified &&
        afterReconcile.vercel.linearWebhookVerified
      ) {
        operation = await writeOperation(
          markSuccess(operation, "ready", {
            projectId: afterReconcile.vercel.projectId,
            stage: "ready",
            completedAt: new Date().toISOString(),
          }),
          input.cwd,
        );
        return finalizeIfReady(operation, input.cwd, deps);
      }

      // Create dedicated bridge when none marked
      if (
        !afterReconcile?.vercel?.projectId?.trim() ||
        reconcileResult?.status === "not_found" ||
        reconcileResult?.status === "unhealthy" ||
        reconcileResult?.status === "verification_failed"
      ) {
        const linearApiKey = (await loadLinearApiKey(input.cwd))?.trim();
        const plan: VercelBridgePlanInput = {
          vercelToken: token,
          team: {
            mode: "existing",
            teamId: operation.selectedScope?.teamId,
          },
          project: {
            mode: "create",
            projectName: operation.intendedBridgeProjectName,
          },
          teamId: operation.selectedScope?.teamId,
          projectName: operation.intendedBridgeProjectName,
          linearApiKey,
          linearTeamId:
            afterReconcile?.linearWorkspace?.teams[0]?.teamId ??
            afterReconcile?.linear?.teamId,
          derivedHarnessTeamKey:
            afterReconcile?.linearWorkspace?.teams[0]?.teamKey ??
            afterReconcile?.linear?.teamKey,
        };

        const previewResult = await preview(plan);
        if (previewResult.validationError || !previewResult.readiness.ready) {
          operation = await writeOperation(
            failOperation(operation, {
              stage: "preparing_bridge",
              humanProblem:
                previewResult.validationError ??
                (previewResult.readiness.blockers.join(" ") ||
                  "Unable to prepare the automation bridge."),
              nextAction: "retry_recovery",
              retrySafe: true,
            }),
            input.cwd,
          );
          return toPublicStatus(operation, input.cwd);
        }

        operation = await writeOperation(
          markSuccess(operation, "preparing_bridge", {
            stage: "deploying_bridge",
          }),
          input.cwd,
        );

        const applyResult = await apply({
          plan,
          confirmed: true,
          fingerprint: previewResult.fingerprint,
          cwd: input.cwd,
        });

        operation = await writeOperation(
          {
            ...operation,
            remoteMutationsOccurred: true,
            projectId: applyResult.projectId ?? operation.projectId,
            pollActionId: applyResult.pollActionId,
            linearWebhookId: undefined,
          },
          input.cwd,
        );

        if (applyResult.setupBlocked) {
          operation = await writeOperation(
            failOperation(operation, {
              stage: "deploying_bridge",
              humanProblem: applyResult.setupBlocked.message,
              nextAction: "retry_deployment",
              retrySafe: true,
              remoteMutationsOccurred: true,
            }),
            input.cwd,
          );
          return toPublicStatus(operation, input.cwd);
        }

        if (applyResult.setupPending && applyResult.pollActionId) {
          operation = await writeOperation(
            markSuccess(operation, "deploying_bridge", {
              stage: "verifying_webhook",
              pollActionId: applyResult.pollActionId,
            }),
            input.cwd,
          );
          const polled = await poll({
            actionId: applyResult.pollActionId,
            cwd: input.cwd,
          });
          if (!polled.verified) {
            operation = await writeOperation(
              failOperation(operation, {
                stage: "verifying_webhook",
                humanProblem:
                  applyResultProblem(polled) ||
                  "Webhook verification did not complete after deployment.",
                nextAction: "retry_verification",
                retrySafe: true,
                remoteMutationsOccurred: true,
              }),
              input.cwd,
            );
            return toPublicStatus(operation, input.cwd);
          }
        } else if (!applyResult.verified) {
          operation = await writeOperation(
            failOperation(operation, {
              stage: applyResult.signedProbeVerified
                ? "connecting_linear"
                : "verifying_webhook",
              humanProblem: applyResultProblem(applyResult),
              nextAction: applyLinearWebhookOk(applyResult)
                ? "retry_verification"
                : "retry_linear_connection",
              retrySafe: true,
              remoteMutationsOccurred: true,
            }),
            input.cwd,
          );
          return toPublicStatus(operation, input.cwd);
        }

        operation = await writeOperation(
          markSuccess(operation, "connecting_linear", {
            stage: "ready",
            projectId: applyResult.projectId ?? operation.projectId,
            completedAt: new Date().toISOString(),
          }),
          input.cwd,
        );
        return finalizeIfReady(operation, input.cwd, deps);
      }

      // Reconcile path: existing marked bridge, may need redeploy/verify
      if (afterReconcile?.vercel?.projectId?.trim()) {
        operation = await writeOperation(
          markSuccess(operation, "preparing_bridge", {
            projectId: afterReconcile.vercel.projectId,
            stage: "deploying_bridge",
          }),
          input.cwd,
        );

        const linearApiKey = (await loadLinearApiKey(input.cwd))?.trim();
        const plan: VercelBridgePlanInput = {
          vercelToken: token,
          team: {
            mode: "existing",
            teamId: afterReconcile.vercel.teamId ?? operation.selectedScope?.teamId,
          },
          project: {
            mode: "existing",
            projectId: afterReconcile.vercel.projectId,
            projectName: afterReconcile.vercel.projectName,
          },
          teamId: afterReconcile.vercel.teamId ?? operation.selectedScope?.teamId,
          projectId: afterReconcile.vercel.projectId,
          projectName: afterReconcile.vercel.projectName,
          linearApiKey,
          linearTeamId:
            afterReconcile.linearWorkspace?.teams[0]?.teamId ??
            afterReconcile.linear?.teamId,
          derivedHarnessTeamKey:
            afterReconcile.linearWorkspace?.teams[0]?.teamKey ??
            afterReconcile.linear?.teamKey,
          allowExistingProjectBridgeInstall: true,
        };
        const previewResult = await preview(plan);
        const applyResult = await apply({
          plan,
          confirmed: true,
          fingerprint: previewResult.fingerprint,
          cwd: input.cwd,
        });
        operation = await writeOperation(
          {
            ...operation,
            remoteMutationsOccurred: true,
            pollActionId: applyResult.pollActionId,
          },
          input.cwd,
        );

        if (applyResult.setupPending && applyResult.pollActionId) {
          const polled = await poll({
            actionId: applyResult.pollActionId,
            cwd: input.cwd,
          });
          if (!polled.verified) {
            operation = await writeOperation(
              failOperation(operation, {
                stage: "verifying_webhook",
                humanProblem:
                  applyResultProblem(polled) ||
                  "Webhook verification failed after redeploy.",
                nextAction: "retry_verification",
                retrySafe: true,
                remoteMutationsOccurred: true,
              }),
              input.cwd,
            );
            return toPublicStatus(operation, input.cwd);
          }
        } else if (!applyResult.verified) {
          operation = await writeOperation(
            failOperation(operation, {
              stage: "verifying_webhook",
              humanProblem:
                applyResultProblem(applyResult) ||
                "Bridge verification incomplete.",
              nextAction: "retry_verification",
              retrySafe: true,
              remoteMutationsOccurred: true,
            }),
            input.cwd,
          );
          return toPublicStatus(operation, input.cwd);
        }

        operation = await writeOperation(
          markSuccess(operation, "ready", {
            stage: "ready",
            projectId: afterReconcile.vercel.projectId,
            completedAt: new Date().toISOString(),
          }),
          input.cwd,
        );
        return finalizeIfReady(operation, input.cwd, deps);
      }
    }

    // Poll pending redeploy if mid-flight
    if (
      operation.pollActionId &&
      (operation.stage === "deploying_bridge" ||
        operation.stage === "verifying_webhook")
    ) {
      const polled = await poll({
        actionId: operation.pollActionId,
        cwd: input.cwd,
      });
      if (polled.verified) {
        operation = await writeOperation(
          markSuccess(operation, "ready", {
            stage: "ready",
            completedAt: new Date().toISOString(),
          }),
          input.cwd,
        );
        return finalizeIfReady(operation, input.cwd, deps);
      }
      operation = await writeOperation(
        failOperation(operation, {
          stage: "verifying_webhook",
          humanProblem:
            applyResultProblem(polled) ||
            "Deployment verification incomplete.",
          nextAction: "retry_verification",
          retrySafe: true,
        }),
        input.cwd,
      );
      return toPublicStatus(operation, input.cwd);
    }

    if (operation.stage === "ready") {
      return finalizeIfReady(operation, input.cwd, deps);
    }

    return toPublicStatus(operation, input.cwd);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Vercel recovery failed.";
    // Never instruct the operator to edit .env.local manually.
    const sanitized = message
      .replace(/\.env\.local/gi, "saved credentials")
      .replace(/vercel cli/gi, "PDev");
    operation = await writeOperation(
      failOperation(operation, {
        stage: operation.stage,
        humanProblem: sanitized,
        nextAction: "retry_recovery",
        retrySafe: true,
      }),
      input.cwd,
    );
    return toPublicStatus(operation, input.cwd);
  }
}

async function finalizeIfReady(
  operation: VercelRecoveryOperation,
  cwd: string | undefined,
  deps: VercelRecoveryDependencies,
): Promise<VercelRecoveryPublicStatus> {
  const reconcileCompletion =
    deps.reconcileCompletion ?? reconcileInitialSetupCompletion;

  // Persist authoritative control-plane vercel is already done by apply/reconcile.
  // Run canonical initial-setup reconciliation when summary loaders are provided.
  if (deps.loadSetupSummary && deps.loadRemoteSummary) {
    const setupSummary = await deps.loadSetupSummary(cwd);
    const remoteSummary = await deps.loadRemoteSummary(cwd);
    await reconcileCompletion({
      cwd,
      setupSummary,
      remoteSummary,
      completedByVersion: "v0.4-vercel-connection-recovery",
    });
  } else {
    // Best-effort: mark vercel evidence from current control plane when summaries unavailable
    const state = await readControlPlaneSetupState(cwd);
    if (
      state?.vercel?.projectId &&
      state.vercel.signedProbeVerified &&
      state.vercel.linearWebhookVerified &&
      state.initialSetup?.status !== "complete"
    ) {
      // Leave completion to GUI which has summary loaders; still report ready.
      await updateControlPlaneSetupState({}, cwd);
    }
  }

  const ready = await writeOperation(
    {
      ...operation,
      stage: "ready",
      lastSuccessfulStage: "ready",
      completedAt: operation.completedAt ?? new Date().toISOString(),
      nextAction: "none",
      retrySafe: true,
    },
    cwd,
  );
  return toPublicStatus(ready, cwd);
}

async function toPublicStatus(
  operation: VercelRecoveryOperation,
  cwd?: string,
): Promise<VercelRecoveryPublicStatus> {
  const state = await readControlPlaneSetupState(cwd);
  const bridgeHealth =
    operation.stage === "deploying_bridge"
      ? "deploying"
      : assessDurableBridgeHealth(state);
  return {
    operation,
    bridgeHealth,
    initialSetupComplete: state?.initialSetup?.status === "complete",
    redirectToWorkflow:
      operation.stage === "ready" &&
      (state?.initialSetup?.status === "complete" ||
        Boolean(
          state?.vercel?.signedProbeVerified &&
            state?.vercel?.linearWebhookVerified,
        )),
    completionEvidence: state?.initialSetup?.completionEvidence,
  };
}

