import { access } from "node:fs/promises";
import type { ControlPlaneSetupState } from "./control-plane-types.js";
import {
  readControlPlaneSetupState,
  updateControlPlaneSetupState,
} from "./control-plane-setup-state.js";
import type { RemoteSetupSummary } from "./remote-setup-summary.js";
import type { SetupGuiViewModel } from "./gui-view-model.js";
import { resolveLocalFilePaths } from "./setup-state.js";
import { HARNESS_ACTIONS_SECRET_NAMES } from "./remote-actions.js";

export type InitialSetupCompletionEvidence = {
  localConfigPresent: boolean;
  linearConfigured: boolean;
  vercelConfigured: boolean;
  cloudSecretsVerified: boolean;
  targetWorkflowsVerified: boolean;
};

export function isInitialSetupComplete(
  state: ControlPlaneSetupState | null | undefined,
): boolean {
  return state?.initialSetup?.status === "complete";
}

export function assessCompletionEvidence(input: {
  setupSummary: SetupGuiViewModel;
  remoteSummary: RemoteSetupSummary;
  controlPlane: ControlPlaneSetupState | null;
}): InitialSetupCompletionEvidence {
  const { setupSummary, remoteSummary, controlPlane } = input;

  const localConfigPresent =
    setupSummary.overview.configResolved &&
    setupSummary.overview.localFilesPresent &&
    setupSummary.overview.readyForLocalDoctor;

  const linearConfigured = Boolean(
    controlPlane?.linearWorkspace?.teams.some(
      (team) => team.projects.length > 0,
    ) ||
      (controlPlane?.linear?.teamId?.trim() &&
        controlPlane.linear.teamKey?.trim()),
  );

  const vercelConfigured = Boolean(controlPlane?.vercel?.projectId?.trim());

  const cloudSecretsVerified =
    remoteSummary.harnessSecretStatuses.length > 0 &&
    HARNESS_ACTIONS_SECRET_NAMES.every((name) =>
      remoteSummary.harnessSecretStatuses.some(
        (entry) => entry.name === name && entry.status === "present",
      ),
    );

  const targetWorkflowsVerified =
    remoteSummary.targetRepos.length > 0 &&
    remoteSummary.targetRepos.every(
      (repo) => repo.workflowStatus === "present",
    );

  return {
    localConfigPresent,
    linearConfigured,
    vercelConfigured,
    cloudSecretsVerified,
    targetWorkflowsVerified,
  };
}

export function isCompletionEvidenceSatisfied(
  evidence: InitialSetupCompletionEvidence,
): evidence is {
  localConfigPresent: true;
  linearConfigured: true;
  vercelConfigured: true;
  cloudSecretsVerified: true;
  targetWorkflowsVerified: true;
} {
  return (
    evidence.localConfigPresent &&
    evidence.linearConfigured &&
    evidence.vercelConfigured &&
    evidence.cloudSecretsVerified &&
    evidence.targetWorkflowsVerified
  );
}

export async function writeInitialSetupComplete(
  cwd: string | undefined,
  evidence: {
    localConfigPresent: true;
    linearConfigured: true;
    vercelConfigured: true;
    cloudSecretsVerified: true;
    targetWorkflowsVerified: true;
  },
  completedByVersion?: string,
): Promise<ControlPlaneSetupState> {
  return updateControlPlaneSetupState(
    {
      initialSetup: {
        status: "complete",
        completedAt: new Date().toISOString(),
        completedByVersion,
        completionEvidence: evidence,
      },
    },
    cwd,
  );
}

export async function migrateExistingCompletedWorkspace(input: {
  cwd?: string;
  setupSummary: SetupGuiViewModel;
  remoteSummary: RemoteSetupSummary;
}): Promise<ControlPlaneSetupState | null> {
  const cwd = input.cwd;
  const existing = await readControlPlaneSetupState(cwd);
  if (isInitialSetupComplete(existing)) {
    return existing;
  }

  const evidence = assessCompletionEvidence({
    setupSummary: input.setupSummary,
    remoteSummary: input.remoteSummary,
    controlPlane: existing,
  });

  if (!isCompletionEvidenceSatisfied(evidence)) {
    return existing;
  }

  return writeInitialSetupComplete(cwd, evidence, "v0.4-configure-migration");
}

export async function completeInitialSetupFromServer(input: {
  cwd?: string;
  setupSummary: SetupGuiViewModel;
  remoteSummary: RemoteSetupSummary;
}): Promise<
  | { ok: true; state: ControlPlaneSetupState }
  | { ok: false; evidence: InitialSetupCompletionEvidence }
> {
  const cwd = input.cwd;
  const controlPlane = await readControlPlaneSetupState(cwd);
  if (isInitialSetupComplete(controlPlane)) {
    return { ok: true, state: controlPlane! };
  }

  const evidence = assessCompletionEvidence({
    setupSummary: input.setupSummary,
    remoteSummary: input.remoteSummary,
    controlPlane,
  });

  if (!isCompletionEvidenceSatisfied(evidence)) {
    return { ok: false, evidence };
  }

  const state = await writeInitialSetupComplete(cwd, evidence);
  return { ok: true, state };
}

export async function readInitialSetupRoutingState(cwd?: string): Promise<{
  complete: boolean;
  state: ControlPlaneSetupState | null;
}> {
  const paths = resolveLocalFilePaths(cwd);
  try {
    await access(paths.harnessDir);
  } catch {
    return { complete: false, state: null };
  }

  const state = await readControlPlaneSetupState(cwd);
  return {
    complete: isInitialSetupComplete(state),
    state,
  };
}
