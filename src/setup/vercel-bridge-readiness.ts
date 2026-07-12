export const REQUIRED_VERCEL_BRIDGE_ENV_VARS = [
  "LINEAR_WEBHOOK_SECRET",
  "GITHUB_DISPATCH_TOKEN",
  "HARNESS_TEAM_KEY",
] as const;

export type VercelBridgeEnvVarName =
  (typeof REQUIRED_VERCEL_BRIDGE_ENV_VARS)[number];

export const OPTIONAL_VERCEL_BRIDGE_ENV_VARS = [
  "GITHUB_DISPATCH_REPOSITORY",
  "GITHUB_DISPATCH_EVENT_TYPE",
  "LINEAR_WEBHOOK_TIMESTAMP_TOLERANCE_MS",
] as const;

export type OptionalVercelBridgeEnvVarName =
  (typeof OPTIONAL_VERCEL_BRIDGE_ENV_VARS)[number];

export const DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS: Record<
  OptionalVercelBridgeEnvVarName,
  string
> = {
  GITHUB_DISPATCH_REPOSITORY: "weston-uribe/agentic-product-development-harness",
  GITHUB_DISPATCH_EVENT_TYPE: "linear_issue_status_changed",
  LINEAR_WEBHOOK_TIMESTAMP_TOLERANCE_MS: "60000",
};

export interface VercelBridgeReadiness {
  projectSelected: boolean;
  productionUrl?: string;
  webhookUrl?: string;
  endpointReachable: boolean;
  requiredEnvPresence: Record<VercelBridgeEnvVarName, "present" | "missing">;
  linearWebhookVerified: boolean;
  signedProbeVerified: boolean;
  deploymentRedeployRequired: boolean;
  manualComplete: boolean;
  ready: boolean;
  blockers: string[];
}

export function deriveVercelBridgeReadiness(input: {
  projectId?: string;
  productionUrl?: string;
  webhookUrl?: string;
  endpointReachable?: boolean;
  requiredEnvPresence?: Partial<
    Record<VercelBridgeEnvVarName, "present" | "missing">
  >;
  linearWebhookVerified?: boolean;
  signedProbeVerified?: boolean;
  deploymentRedeployRequired?: boolean;
  manualComplete?: boolean;
}): VercelBridgeReadiness {
  const requiredEnvPresence = {
    LINEAR_WEBHOOK_SECRET:
      input.requiredEnvPresence?.LINEAR_WEBHOOK_SECRET ?? "missing",
    GITHUB_DISPATCH_TOKEN:
      input.requiredEnvPresence?.GITHUB_DISPATCH_TOKEN ?? "missing",
    HARNESS_TEAM_KEY: input.requiredEnvPresence?.HARNESS_TEAM_KEY ?? "missing",
  } satisfies Record<VercelBridgeEnvVarName, "present" | "missing">;

  const blockers: string[] = [];
  if (!input.projectId) {
    blockers.push("Select the Vercel bridge project.");
  }
  if (!input.productionUrl) {
    blockers.push("Resolve the Vercel production URL for the bridge project.");
  }
  if (!input.endpointReachable) {
    blockers.push(
      "Verify /api/linear-webhook is reachable on the production URL.",
    );
  }
  for (const [key, status] of Object.entries(requiredEnvPresence)) {
    if (status === "missing") {
      blockers.push(`Vercel production env var ${key} is missing.`);
    }
  }
  if (!input.linearWebhookVerified) {
    blockers.push(
      "Verify the Linear Issue webhook points at the Vercel bridge URL.",
    );
  }
  if (!input.signedProbeVerified) {
    blockers.push(
      "Signed webhook delivery verification has not passed against production.",
    );
  }
  if (input.deploymentRedeployRequired) {
    blockers.push(
      "Redeploy Vercel production after env var changes, then retry signed verification.",
    );
  }

  const ready =
    blockers.length === 0 &&
    Boolean(input.projectId) &&
    Boolean(input.productionUrl) &&
    Boolean(input.endpointReachable) &&
    input.linearWebhookVerified === true &&
    input.signedProbeVerified === true &&
    input.deploymentRedeployRequired !== true;

  return {
    projectSelected: Boolean(input.projectId),
    productionUrl: input.productionUrl,
    webhookUrl: input.webhookUrl,
    endpointReachable: Boolean(input.endpointReachable),
    requiredEnvPresence,
    linearWebhookVerified: Boolean(input.linearWebhookVerified),
    signedProbeVerified: Boolean(input.signedProbeVerified),
    deploymentRedeployRequired: Boolean(input.deploymentRedeployRequired),
    manualComplete: Boolean(input.manualComplete),
    ready,
    blockers,
  };
}

export function isVercelBridgeStale(input: {
  configuredTeamKey?: string;
  selectedTeamKey?: string;
  configuredProjectId?: string;
  selectedProjectId?: string;
  configuredProductionUrl?: string;
  selectedProductionUrl?: string;
}): boolean {
  if (
    input.configuredTeamKey &&
    input.selectedTeamKey &&
    input.configuredTeamKey !== input.selectedTeamKey
  ) {
    return true;
  }
  if (
    input.configuredProjectId &&
    input.selectedProjectId &&
    input.configuredProjectId !== input.selectedProjectId
  ) {
    return true;
  }
  if (
    input.configuredProductionUrl &&
    input.selectedProductionUrl &&
    input.configuredProductionUrl !== input.selectedProductionUrl
  ) {
    return true;
  }
  return false;
}
