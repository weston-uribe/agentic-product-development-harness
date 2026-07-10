import { createHash } from "node:crypto";
import {
  buildWebhookUrl,
  checkWebhookEndpointReachable,
  listVercelProductionDeployments,
  listVercelProjectEnvVars,
  listVercelProjects,
  listVercelTeams,
  summarizeRequiredEnvPresence,
} from "./vercel-setup-client.js";
import {
  DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS,
  deriveVercelBridgeReadiness,
  OPTIONAL_VERCEL_BRIDGE_ENV_VARS,
  REQUIRED_VERCEL_BRIDGE_ENV_VARS,
  type VercelBridgeEnvVarName,
} from "./vercel-bridge-readiness.js";
import { summarizeLinearWebhookReadiness } from "./linear-setup-plan.js";
import { SETUP_PERMISSIONS } from "./permission-model.js";
import { tokenizeSecretInput } from "./remote-preview-fingerprint.js";

export const VERCEL_SETUP_ACTIONS = {
  preview: {
    id: "preview-vercel-bridge",
    permission: SETUP_PERMISSIONS.remoteRead,
  },
  apply: {
    id: "apply-vercel-bridge",
    permission: SETUP_PERMISSIONS.remoteSecretWrite,
  },
} as const;

export interface VercelBridgeEnvInput {
  LINEAR_WEBHOOK_SECRET?: string;
  GITHUB_DISPATCH_TOKEN?: string;
  HARNESS_TEAM_KEY?: string;
  GITHUB_DISPATCH_REPOSITORY?: string;
  GITHUB_DISPATCH_EVENT_TYPE?: string;
  LINEAR_WEBHOOK_TIMESTAMP_TOLERANCE_MS?: string;
}

export interface VercelBridgePlanInput {
  vercelToken: string;
  teamId?: string;
  projectId?: string;
  projectName?: string;
  linearApiKey?: string;
  linearTeamId?: string;
  envInput?: VercelBridgeEnvInput;
}

export interface VercelEnvWritePlanEntry {
  key: VercelBridgeEnvVarName | (typeof OPTIONAL_VERCEL_BRIDGE_ENV_VARS)[number];
  action: "create" | "update" | "skip";
  source: "operator-input" | "default" | "preserve-existing" | "missing-input";
}

export interface VercelBridgePreview {
  actionId: string;
  teams: Awaited<ReturnType<typeof listVercelTeams>>;
  projects: Awaited<ReturnType<typeof listVercelProjects>>;
  selectedProject?: Awaited<ReturnType<typeof listVercelProjects>>[number];
  productionUrl?: string;
  webhookUrl?: string;
  endpointReachable: boolean;
  endpointStatusCode?: number;
  envWritePlan: VercelEnvWritePlanEntry[];
  requiredEnvPresence: Record<VercelBridgeEnvVarName, "present" | "missing">;
  linearWebhookVerified: boolean;
  readiness: ReturnType<typeof deriveVercelBridgeReadiness>;
  manualSteps: string[];
  fingerprint: string;
  permission: typeof SETUP_PERMISSIONS.remoteRead;
  validationError?: string;
}

function hashPreview(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
}

function buildEnvWritePlan(input: {
  existingKeys: Set<string>;
  envInput?: VercelBridgeEnvInput;
}): VercelEnvWritePlanEntry[] {
  const plan: VercelEnvWritePlanEntry[] = [];

  for (const key of REQUIRED_VERCEL_BRIDGE_ENV_VARS) {
    const value = input.envInput?.[key]?.trim();
    if (!value) {
      plan.push({
        key,
        action: "skip",
        source: input.existingKeys.has(key) ? "preserve-existing" : "missing-input",
      });
      continue;
    }
    plan.push({
      key,
      action: input.existingKeys.has(key) ? "update" : "create",
      source: "operator-input",
    });
  }

  for (const key of OPTIONAL_VERCEL_BRIDGE_ENV_VARS) {
    const value =
      input.envInput?.[key]?.trim() ?? DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS[key];
    if (!value) {
      plan.push({ key, action: "skip", source: "missing-input" });
      continue;
    }
    if (input.existingKeys.has(key)) {
      plan.push({ key, action: "skip", source: "preserve-existing" });
      continue;
    }
    plan.push({
      key,
      action: "create",
      source: input.envInput?.[key]?.trim() ? "operator-input" : "default",
    });
  }

  return plan;
}

export async function previewVercelBridgeSetup(
  input: VercelBridgePlanInput,
): Promise<VercelBridgePreview> {
  if (!input.vercelToken.trim()) {
    return {
      actionId: VERCEL_SETUP_ACTIONS.preview.id,
      teams: [],
      projects: [],
      endpointReachable: false,
      envWritePlan: [],
      requiredEnvPresence: {
        LINEAR_WEBHOOK_SECRET: "missing",
        GITHUB_DISPATCH_TOKEN: "missing",
        HARNESS_TEAM_KEY: "missing",
      },
      linearWebhookVerified: false,
      readiness: deriveVercelBridgeReadiness({}),
      manualSteps: ["Add VERCEL_TOKEN in Step 1 before previewing the Vercel bridge."],
      fingerprint: hashPreview({ invalid: "missing-vercel-token" }),
      permission: VERCEL_SETUP_ACTIONS.preview.permission,
      validationError: "VERCEL_TOKEN is required for Vercel bridge preview.",
    };
  }

  const teams = await listVercelTeams(input.vercelToken);
  const projects = await listVercelProjects(input.vercelToken, input.teamId);
  const selectedProject =
    projects.find((project) => project.id === input.projectId) ??
    projects.find((project) => project.name === input.projectName);

  if (!selectedProject) {
    return {
      actionId: VERCEL_SETUP_ACTIONS.preview.id,
      teams,
      projects,
      endpointReachable: false,
      envWritePlan: [],
      requiredEnvPresence: {
        LINEAR_WEBHOOK_SECRET: "missing",
        GITHUB_DISPATCH_TOKEN: "missing",
        HARNESS_TEAM_KEY: "missing",
      },
      linearWebhookVerified: false,
      readiness: deriveVercelBridgeReadiness({}),
      manualSteps: ["Select or enter the Vercel bridge project."],
      fingerprint: hashPreview({ invalid: "missing-project" }),
      permission: VERCEL_SETUP_ACTIONS.preview.permission,
      validationError: "Vercel bridge project is required.",
    };
  }

  const deployments = await listVercelProductionDeployments(
    input.vercelToken,
    selectedProject.id,
    input.teamId,
  );
  const productionDeployment = deployments.find(
    (deployment) => deployment.readyState === "READY" || deployment.state === "READY",
  );
  const productionUrl = productionDeployment
    ? `https://${productionDeployment.url}`
    : undefined;
  const webhookUrl = productionUrl ? buildWebhookUrl(productionDeployment!.url) : undefined;
  const endpoint = webhookUrl
    ? await checkWebhookEndpointReachable(webhookUrl)
    : { reachable: false };

  const envVars = await listVercelProjectEnvVars(
    input.vercelToken,
    selectedProject.id,
    input.teamId,
  );
  const requiredEnvPresence = summarizeRequiredEnvPresence(envVars);
  const envWritePlan = buildEnvWritePlan({
    existingKeys: new Set(envVars.map((env) => env.key)),
    envInput: input.envInput,
  });

  let linearWebhookVerified = false;
  const manualSteps: string[] = [];
  if (input.linearApiKey && webhookUrl) {
    const webhookSummary = await summarizeLinearWebhookReadiness({
      linearApiKey: input.linearApiKey,
      webhookUrl,
      teamId: input.linearTeamId,
    });
    linearWebhookVerified = Boolean(webhookSummary.matchingWebhook);
    manualSteps.push(...webhookSummary.manualSteps);
  } else {
    manualSteps.push(
      "After Vercel env vars are configured, create or verify the Linear Issue webhook.",
    );
  }

  const readiness = deriveVercelBridgeReadiness({
    projectId: selectedProject.id,
    productionUrl,
    webhookUrl,
    endpointReachable: endpoint.reachable,
    requiredEnvPresence,
    linearWebhookVerified,
  });

  const fingerprint = hashPreview({
    actionId: VERCEL_SETUP_ACTIONS.preview.id,
    teamId: input.teamId,
    projectId: selectedProject.id,
    envWritePlan: envWritePlan.map((entry) => ({
      key: entry.key,
      action: entry.action,
      source: entry.source,
    })),
    linearWebhookSecretToken: tokenizeSecretInput(
      input.envInput?.LINEAR_WEBHOOK_SECRET,
    ),
    githubDispatchTokenToken: tokenizeSecretInput(
      input.envInput?.GITHUB_DISPATCH_TOKEN,
    ),
    harnessTeamKey: input.envInput?.HARNESS_TEAM_KEY ?? "",
    vercelTokenToken: tokenizeSecretInput(input.vercelToken),
  });

  return {
    actionId: VERCEL_SETUP_ACTIONS.preview.id,
    teams,
    projects,
    selectedProject,
    productionUrl,
    webhookUrl,
    endpointReachable: endpoint.reachable,
    endpointStatusCode: endpoint.statusCode,
    envWritePlan,
    requiredEnvPresence,
    linearWebhookVerified,
    readiness,
    manualSteps,
    fingerprint,
    permission: VERCEL_SETUP_ACTIONS.preview.permission,
  };
}
