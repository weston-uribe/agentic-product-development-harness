import {
  loadLinearSetupSummary,
  loadRemoteSetupSummary,
  loadSetupSummary,
  loadVercelSetupSummary,
} from "@/lib/setup-server";
import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";
import { readControlPlaneSetupState } from "@harness/setup/control-plane-setup-state";
import { readWorkflowModelsSyncEvidence } from "@harness/setup/workflow-models-sync-evidence";
import { readWorkflowConfigSnapshot } from "@harness/setup/workflow-config-snapshot";
import { resolvePlannerModel, resolveBuilderModel } from "@harness/cursor/model";
import { loadTargetRepoOverviewFields } from "@/lib/settings/load-target-repo-overview-fields";

export async function loadSettingsOverview() {
  const cwd = resolveHarnessWorkspaceDir();
  const [
    setupSummary,
    remoteSummary,
    linearSummary,
    vercelSummary,
    controlPlane,
    workflowSync,
    configSnapshot,
    targetRepoOverview,
  ] = await Promise.all([
    loadSetupSummary(),
    loadRemoteSetupSummary(),
    loadLinearSetupSummary(),
    loadVercelSetupSummary(),
    readControlPlaneSetupState(cwd),
    readWorkflowModelsSyncEvidence(cwd),
    readWorkflowConfigSnapshot(cwd).catch(() => null),
    loadTargetRepoOverviewFields(cwd),
  ]);

  const plannerModel = configSnapshot
    ? resolvePlannerModel(configSnapshot.config).id
    : undefined;
  const builderModel = configSnapshot
    ? resolveBuilderModel(configSnapshot.config).id
    : undefined;

  const credentialLabels = {
    linear: setupSummary.envKeyPresence.LINEAR_API_KEY ? "Configured" : "Missing",
    cursor: setupSummary.envKeyPresence.CURSOR_API_KEY ? "Configured" : "Missing",
    github: setupSummary.envKeyPresence.GITHUB_TOKEN ? "Configured" : "Missing",
    vercel: setupSummary.envKeyPresence.VERCEL_TOKEN ? "Configured" : "Missing",
  };

  const targetRepos = targetRepoOverview.map((repo) => ({
    id: repo.id,
    targetRepo: repo.targetRepo,
    baseBranch: repo.baseBranch,
    previewProvider: repo.previewProvider,
    initializationStatus: repo.initializationStatus,
    initializationDetail: repo.initializationDetail,
    workflowStatus:
      remoteSummary.targetRepos.find(
        (remoteRepo) =>
          remoteRepo.repoConfigId === repo.id ||
          remoteRepo.targetRepo === repo.targetRepo,
      )?.workflowStatus ?? "unknown",
  }));

  return {
    setupComplete: controlPlane?.initialSetup?.status === "complete",
    completedAt: controlPlane?.initialSetup?.completedAt,
    harnessDispatchRepo: remoteSummary.harnessDispatchRepo,
    linear: {
      teamName: controlPlane?.linear?.teamName ?? linearSummary.controlPlane?.linear?.teamName,
      teamKey: controlPlane?.linear?.teamKey ?? linearSummary.controlPlane?.linear?.teamKey,
      projectName:
        controlPlane?.linear?.projectName ??
        linearSummary.controlPlane?.linear?.projectName,
    },
    vercel: {
      projectName: controlPlane?.vercel?.projectName ?? vercelSummary.controlPlane?.vercel?.projectName,
      productionUrl: controlPlane?.vercel?.productionUrl,
      webhookVerified: controlPlane?.vercel?.linearWebhookVerified ?? false,
    },
    credentials: credentialLabels,
    targetRepos,
    models: {
      planner: plannerModel,
      builder: builderModel,
      cloudSyncedAt: workflowSync?.syncedAt,
    },
    doctorSummary: setupSummary.doctor,
    configFingerprint: configSnapshot?.fingerprint,
  };
}

export type SettingsOverview = Awaited<ReturnType<typeof loadSettingsOverview>>;
