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
  ] = await Promise.all([
    loadSetupSummary(),
    loadRemoteSetupSummary(),
    loadLinearSetupSummary(),
    loadVercelSetupSummary(),
    readControlPlaneSetupState(cwd),
    readWorkflowModelsSyncEvidence(cwd),
    readWorkflowConfigSnapshot(cwd).catch(() => null),
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

  const targetRepos = remoteSummary.targetRepos.map((repo) => ({
    id: repo.repoConfigId,
    targetRepo: repo.targetRepo,
    workflowStatus: repo.workflowStatus,
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
