import type { SetupGuiViewModel } from "./gui-view-model.js";
import type { ControlPlaneReadinessContext } from "./control-plane-types.js";
import { allReposSkipApplicationPreview } from "../preview/preview-capability.js";
import { requiredStatusNames } from "./linear-status-contract.js";
import { isVercelBridgeStale } from "./vercel-bridge-readiness.js";
import type { ReadinessBlocker } from "./first-run-readiness.js";

function pushBlocker(
  blockers: ReadinessBlocker[],
  blocker: Omit<ReadinessBlocker, "blocking" | "tone"> & {
    blocking?: boolean;
    tone?: "setup_needed" | "error";
  },
): void {
  blockers.push({
    blocking: true,
    tone: blocker.tone ?? "setup_needed",
    ...blocker,
  });
}

export { allReposSkipApplicationPreview } from "../preview/preview-capability.js";

export function collectConnectServicesBlockers(
  summary: SetupGuiViewModel,
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];

  if (!summary.envKeyPresence.LINEAR_API_KEY) {
    pushBlocker(blockers, {
      id: "missing-linear-key",
      stepId: "connect-services",
      message: "Setup needed: LINEAR_API_KEY is not configured yet.",
      action: "Add it in Step 1 · Connect services.",
      priority: 103,
    });
  }

  if (!summary.envKeyPresence.CURSOR_API_KEY) {
    pushBlocker(blockers, {
      id: "missing-cursor-key",
      stepId: "connect-services",
      message: "Setup needed: CURSOR_API_KEY is not configured yet.",
      action: "Add it in Step 1 · Connect services.",
      priority: 104,
    });
  }

  if (!summary.envKeyPresence.GITHUB_TOKEN) {
    pushBlocker(blockers, {
      id: "missing-github-token",
      stepId: "connect-services",
      message: "Setup needed: GITHUB_TOKEN is not configured yet.",
      action: "Add it in Step 1 · Connect services.",
      priority: 105,
    });
  }

  if (!summary.envKeyPresence.VERCEL_TOKEN) {
    pushBlocker(blockers, {
      id: "missing-vercel-token",
      stepId: "connect-services",
      message: "Setup needed: VERCEL_TOKEN is not configured yet.",
      action: "Add it in Step 1 · Connect services.",
      priority: 106,
    });
  }

  return blockers.sort((left, right) => left.priority - right.priority);
}

export function collectLinearWorkspaceBlockers(
  context: ControlPlaneReadinessContext,
  uiState?: { linearPreviewStale?: boolean },
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  const linear = context.state?.linear;

  if (!linear?.teamKey) {
    pushBlocker(blockers, {
      id: "linear-workspace-not-applied",
      stepId: "linear-workspace",
      message: "Setup needed: Linear workspace setup is not complete yet.",
      action:
        "Next: Preview and apply Linear team, project, and workflow statuses.",
      priority: 150,
    });
  } else if (!linear.statusCoverageComplete && !linear.manualComplete) {
    pushBlocker(blockers, {
      id: "linear-status-coverage-incomplete",
      stepId: "linear-workspace",
      message: "Blocked: Required Linear workflow statuses are still missing.",
      action:
        "Next: Complete Linear workspace setup or confirm manual status coverage.",
      priority: 151,
    });
  }

  if (uiState?.linearPreviewStale && !linear?.teamKey) {
    pushBlocker(blockers, {
      id: "linear-preview-stale",
      stepId: "linear-workspace",
      message: "Blocked: Linear setup preview is out of date.",
      action: "Next: Regenerate the Linear setup preview, then confirm and apply.",
      priority: 152,
      tone: "error",
    });
  }

  return blockers.sort((left, right) => left.priority - right.priority);
}

export function isApplicationPreviewDeploymentHealthy(
  repos: Array<{ previewProvider?: string }> | undefined,
): boolean {
  return allReposSkipApplicationPreview(repos);
}

export function collectVercelBridgeBlockers(
  context: ControlPlaneReadinessContext,
  uiState?: { vercelPreviewStale?: boolean },
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  const vercel = context.state?.vercel;
  const linearTeamKey = context.state?.linear?.teamKey;

  if (!vercel?.projectId) {
    pushBlocker(blockers, {
      id: "vercel-bridge-not-applied",
      stepId: "vercel-bridge",
      message: "Setup needed: PDev automation bridge setup is not complete yet.",
      action:
        "Next: Preview and apply PDev automation bridge env vars and webhook readiness.",
      priority: 160,
    });
  } else {
    if (!vercel.endpointReachable) {
      pushBlocker(blockers, {
        id: "vercel-endpoint-unreachable",
        stepId: "vercel-bridge",
        message:
          "Blocked: Vercel /api/linear-webhook endpoint is not reachable yet.",
        action:
          "Next: Deploy the bridge project and confirm the public webhook route is reachable.",
        priority: 161,
        tone: "error",
      });
    }

    for (const [key, status] of Object.entries(vercel.envVarPresence ?? {})) {
      if (status === "missing") {
        pushBlocker(blockers, {
          id: `vercel-env-missing-${key}`,
          stepId: "vercel-bridge",
          message: `Blocked: Vercel production env var ${key} is missing.`,
          action: "Next: Apply Vercel bridge env vars or set them manually.",
          priority: 162,
          tone: "error",
        });
      }
    }

    if (!vercel.linearWebhookVerified) {
      pushBlocker(blockers, {
        id: "linear-webhook-unverified",
        stepId: "vercel-bridge",
        message:
          "Blocked: Linear Issue webhook is not verified for the PDev automation bridge URL.",
        action:
          "Next: Create or verify the Linear webhook, then refresh bridge readiness.",
        priority: 163,
        tone: "error",
      });
    }

    if (!vercel.signedProbeVerified) {
      pushBlocker(blockers, {
        id: "signed-probe-unverified",
        stepId: "vercel-bridge",
        message:
          "Blocked: Signed webhook delivery verification has not passed against production.",
        action:
          "Next: Apply PDev automation bridge settings and wait for signed probe verification to pass.",
        priority: 164,
        tone: "error",
      });
    }

    if (vercel.deploymentRedeployRequired) {
      pushBlocker(blockers, {
        id: "vercel-redeploy-required",
        stepId: "vercel-bridge",
        message:
          "Blocked: Vercel production must be redeployed after env var changes before signed verification can pass.",
        action: "Next: Redeploy production, then retry PDev automation bridge apply.",
        priority: 165,
        tone: "error",
      });
    }

    if (
      linearTeamKey &&
      vercel.envVarPresence?.HARNESS_TEAM_KEY === "present" &&
      context.state?.linear?.teamKey &&
      isVercelBridgeStale({
        configuredTeamKey: context.state.linear.teamKey,
        selectedTeamKey: linearTeamKey,
      })
    ) {
      pushBlocker(blockers, {
        id: "vercel-team-key-stale",
        stepId: "vercel-bridge",
        message:
          "Blocked: Vercel HARNESS_TEAM_KEY may be stale after Linear team changes.",
        action: "Next: Re-apply PDev automation bridge setup with the current team key.",
        priority: 166,
        tone: "error",
      });
    }
  }

  if (uiState?.vercelPreviewStale && !vercel?.projectId) {
    pushBlocker(blockers, {
      id: "vercel-preview-stale",
      stepId: "vercel-bridge",
      message: "Blocked: PDev automation bridge preview is out of date.",
      action:
        "Next: Regenerate the PDev automation bridge preview, then confirm and apply.",
      priority: 167,
      tone: "error",
    });
  }

  return blockers.sort((left, right) => left.priority - right.priority);
}


function normalizeCloudSecretsConfigState(input: {
  setupSummary: SetupGuiViewModel;
  controlPlaneContext?: ControlPlaneReadinessContext;
}) {
  const configSummary = input.setupSummary.configSummary;
  return {
    configResolved: input.setupSummary.overview.configResolved,
    operatorConfigResolved: input.setupSummary.overview.operatorConfigResolved,
    linearTeamKeyFromConfig:
      input.controlPlaneContext?.linearTeamKeyFromConfig ?? null,
    linearTeamKeyFromControlPlane:
      input.controlPlaneContext?.state?.linear?.teamKey ?? null,
    repoIds: (configSummary?.repos ?? [])
      .map((repo) => repo.id)
      .sort((left, right) => left.localeCompare(right)),
    repoTargets: (configSummary?.repos ?? [])
      .map((repo) => ({ id: repo.id, targetRepo: repo.targetRepo }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    allowedTargetRepos: [...(configSummary?.allowedTargetRepos ?? [])].sort(
      (left, right) => left.localeCompare(right),
    ),
  };
}

export function computeCloudSecretsConfigStateFingerprint(input: {
  setupSummary: SetupGuiViewModel;
  controlPlaneContext?: ControlPlaneReadinessContext;
}): string {
  // JSON snapshot only — used for equality checks in client + server bundles.
  return JSON.stringify(normalizeCloudSecretsConfigState(input));
}

export function isCloudSecretsStaleFromControlPlane(
  context: ControlPlaneReadinessContext,
): boolean {
  const linearTeamKey = context.state?.linear?.teamKey;
  const configTeamKey = context.linearTeamKeyFromConfig;
  if (linearTeamKey && configTeamKey && linearTeamKey !== configTeamKey) {
    return true;
  }
  return false;
}

export function summarizeLinearWorkspaceStatus(
  context: ControlPlaneReadinessContext,
): {
  configured: boolean;
  teamKey?: string;
  projectName?: string;
  statusCoverageComplete: boolean;
  requiredStatusCount: number;
} {
  const linear = context.state?.linear;
  return {
    configured: Boolean(linear?.teamKey),
    teamKey: linear?.teamKey,
    projectName: linear?.projectName,
    statusCoverageComplete: Boolean(
      linear?.statusCoverageComplete || linear?.manualComplete,
    ),
    requiredStatusCount: requiredStatusNames().length,
  };
}
