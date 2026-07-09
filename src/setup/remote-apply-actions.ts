import {
  collectRemoteSecretInputs,
  redactKnownSecretValues,
  sanitizeSetupActionResult,
} from "./redact-secrets.js";
import type { GitHubRemoteSetupProvider } from "./github-remote-provider.js";
import {
  formatHarnessDispatchRepo,
  resolveHarnessDispatchRepo,
} from "./harness-dispatch-repo.js";
import {
  previewHarnessSecretSetup,
  type HarnessSecretOperatorInput,
} from "./harness-secret-setup.js";
import {
  REMOTE_SETUP_ACTIONS,
  assertRemoteSetupConfirmed,
  assertRemoteSetupFingerprint,
  assertRemoteSetupPermissionScope,
  type RemoteAccessStatus,
  type RemoteHarnessSecretPreview,
  type RemoteTargetWorkflowPreview,
} from "./remote-actions.js";
import { previewTargetWorkflowSetup } from "./target-workflow-setup.js";
import { SETUP_PERMISSIONS } from "./permission-model.js";

const REMOTE_WRITES_DEFERRED_MESSAGE =
  "Remote setup writes are deferred to Milestone 5 PR 2. Use manual instructions until GUI apply is enabled.";

export interface RemoteHarnessSecretPreviewOptions {
  cwd?: string;
  operatorInput?: HarnessSecretOperatorInput;
  manualHarnessDispatchRepo?: string;
  provider?: GitHubRemoteSetupProvider;
}

export interface RemoteHarnessSecretApplyOptions
  extends RemoteHarnessSecretPreviewOptions {
  confirmed: boolean;
  fingerprint: string;
}

export interface RemoteTargetWorkflowPreviewOptions {
  cwd?: string;
  repoConfigId: string;
  targetRepo: string;
  productionBranch: string;
  manualHarnessDispatchRepo?: string;
  provider?: GitHubRemoteSetupProvider;
}

export interface RemoteTargetWorkflowApplyOptions
  extends RemoteTargetWorkflowPreviewOptions {
  confirmed: boolean;
  fingerprint: string;
}

function sanitizeRemotePreviewText(
  text: string,
  secrets: readonly string[],
): string {
  return redactKnownSecretValues(text, secrets);
}

export async function previewRemoteHarnessSecrets(
  options: RemoteHarnessSecretPreviewOptions,
): Promise<RemoteHarnessSecretPreview> {
  const harnessDispatchRepo = await resolveHarnessDispatchRepo({
    cwd: options.cwd,
    manualRepo: options.manualHarnessDispatchRepo,
  });
  const harnessDispatchRepoSlug = formatHarnessDispatchRepo(harnessDispatchRepo);

  let repoAccess: RemoteAccessStatus = "unknown";
  let secretStatuses = undefined;

  if (options.provider && harnessDispatchRepo.resolved) {
    repoAccess = await options.provider.checkHarnessRepoAccess(
      harnessDispatchRepoSlug,
    );
    secretStatuses = await options.provider.listHarnessSecretStatuses(
      harnessDispatchRepoSlug,
    );
  }

  const preview = await previewHarnessSecretSetup({
    cwd: options.cwd,
    operatorInput: options.operatorInput,
    manualHarnessDispatchRepo: options.manualHarnessDispatchRepo,
    secretStatuses,
    repoAccess,
  });

  const knownSecrets = collectRemoteSecretInputs(options.operatorInput);
  const manualInstructions = preview.manualInstructions.map((step) =>
    sanitizeRemotePreviewText(step, knownSecrets),
  );

  return {
    actionId: REMOTE_SETUP_ACTIONS.previewHarnessSecrets.id,
    harnessDispatchRepo: harnessDispatchRepoSlug,
    harnessDispatchRepoResolved: harnessDispatchRepo.resolved,
    harnessDispatchRepoSource: harnessDispatchRepo.source,
    repoAccess,
    secretStatuses:
      secretStatuses ??
      preview.secretWritePlan.map((entry) => ({
        name: entry.name,
        status: "unknown" as const,
      })),
    secretWritePlan: preview.secretWritePlan,
    secretKeyNames: preview.secretWritePlan
      .filter((entry) => entry.action !== "skip")
      .map((entry) => entry.name),
    fingerprint: preview.fingerprint,
    permission: REMOTE_SETUP_ACTIONS.previewHarnessSecrets.permission,
    manualInstructions,
    validationError: preview.validationError
      ? sanitizeRemotePreviewText(preview.validationError, knownSecrets)
      : undefined,
  };
}

export async function applyRemoteHarnessSecrets(
  options: RemoteHarnessSecretApplyOptions,
): Promise<never> {
  assertRemoteSetupConfirmed(options.confirmed);
  assertRemoteSetupPermissionScope(
    REMOTE_SETUP_ACTIONS.applyHarnessSecrets.permission.scope,
    SETUP_PERMISSIONS.remoteSecretWrite.scope,
  );

  const preview = await previewRemoteHarnessSecrets(options);
  assertRemoteSetupFingerprint(options.fingerprint, preview.fingerprint);

  if (preview.validationError) {
    throw new Error(preview.validationError);
  }

  throw new Error(REMOTE_WRITES_DEFERRED_MESSAGE);
}

export async function previewRemoteTargetWorkflow(
  options: RemoteTargetWorkflowPreviewOptions,
): Promise<RemoteTargetWorkflowPreview> {
  const harnessDispatchRepo = await resolveHarnessDispatchRepo({
    cwd: options.cwd,
    manualRepo: options.manualHarnessDispatchRepo,
  });

  const initialPreview = previewTargetWorkflowSetup({
    repoConfigId: options.repoConfigId,
    targetRepo: options.targetRepo,
    productionBranch: options.productionBranch,
    harnessDispatchRepo,
  });

  let workflowStatus = initialPreview.plan.workflowStatus;
  let repoAccess: RemoteAccessStatus = "unknown";
  let productionBranchSha: string | undefined;

  if (options.provider && initialPreview.plan.targetRepoSlug !== "<invalid-target-repo>") {
    const status = await options.provider.checkTargetWorkflowStatus({
      targetRepoSlug: initialPreview.plan.targetRepoSlug,
      workflowPath: initialPreview.plan.workflowPath,
      intendedWorkflowContent: initialPreview.workflowContent,
      productionBranch: options.productionBranch,
    });
    workflowStatus = status.workflowStatus;
    repoAccess = status.repoAccess;
    productionBranchSha = status.productionBranchSha;
  }

  const preview = previewTargetWorkflowSetup({
    repoConfigId: options.repoConfigId,
    targetRepo: options.targetRepo,
    productionBranch: options.productionBranch,
    harnessDispatchRepo,
    workflowStatus,
    productionBranchSha,
  });

  return {
    actionId: REMOTE_SETUP_ACTIONS.previewTargetWorkflowPr.id,
    plan: preview.plan,
    repoAccess,
    workflowPreviewSummary: preview.workflowPreviewSummary,
    fingerprint: preview.fingerprint,
    permission: REMOTE_SETUP_ACTIONS.previewTargetWorkflowPr.permission,
    manualInstructions: preview.manualInstructions,
    validationError: preview.validationError,
  };
}

export async function applyRemoteTargetWorkflow(
  options: RemoteTargetWorkflowApplyOptions,
): Promise<never> {
  assertRemoteSetupConfirmed(options.confirmed);
  assertRemoteSetupPermissionScope(
    REMOTE_SETUP_ACTIONS.applyTargetWorkflowPr.permission.scope,
    SETUP_PERMISSIONS.remoteRepoWrite.scope,
  );

  const preview = await previewRemoteTargetWorkflow(options);
  assertRemoteSetupFingerprint(options.fingerprint, preview.fingerprint);

  if (preview.validationError) {
    throw new Error(preview.validationError);
  }

  if (preview.plan.directProductionBranchWrite !== false) {
    throw new Error("Direct production branch writes are not allowed");
  }

  throw new Error(REMOTE_WRITES_DEFERRED_MESSAGE);
}

export function sanitizeRemoteHarnessSecretPreview(
  preview: RemoteHarnessSecretPreview,
  knownSecrets: readonly string[] = [],
): RemoteHarnessSecretPreview {
  return {
    ...preview,
    manualInstructions: preview.manualInstructions.map((step) =>
      sanitizeRemotePreviewText(step, knownSecrets),
    ),
    validationError: preview.validationError
      ? sanitizeRemotePreviewText(preview.validationError, knownSecrets)
      : undefined,
  };
}

export function toSanitizedRemoteSetupActionResult(
  preview: RemoteHarnessSecretPreview,
  knownSecrets: readonly string[] = [],
) {
  return sanitizeSetupActionResult(
    {
      actionId: preview.actionId,
      outcome: "preview",
      permission: preview.permission,
      reason: preview.secretKeyNames.length
        ? `Would write secret keys: ${preview.secretKeyNames.join(", ")}`
        : "No harness repo secrets would be written",
      manualInstructions: preview.manualInstructions,
    },
    knownSecrets,
  );
}
