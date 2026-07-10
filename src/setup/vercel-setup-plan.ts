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
import { planLinearWebhookSecret } from "./linear-webhook-secret.js";
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
  derivedHarnessTeamKey?: string;
  derivedGithubDispatchToken?: string;
  willGenerateLinearWebhookSecret?: boolean;
}

export interface VercelEnvWritePlanEntry {
  key: VercelBridgeEnvVarName | (typeof OPTIONAL_VERCEL_BRIDGE_ENV_VARS)[number];
  action: "create" | "update" | "skip";
  source:
    | "operator-input"
    | "default"
    | "preserve-existing"
    | "missing-input"
    | "derived"
    | "generated";
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
  linearWebhookSecretMode?: "automated" | "existing-unverified" | "manual-copy";
  githubDispatchSource?: "saved-github-token" | "operator-input" | "missing";
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
  derivedHarnessTeamKey?: string;
  derivedGithubDispatchToken?: string;
  willGenerateLinearWebhookSecret?: boolean;
}): VercelEnvWritePlanEntry[] {
  const plan: VercelEnvWritePlanEntry[] = [];

  const resolveRequired = (
    key: (typeof REQUIRED_VERCEL_BRIDGE_ENV_VARS)[number],
  ): { value?: string; source: VercelEnvWritePlanEntry["source"] } => {
    const operatorValue = input.envInput?.[key]?.trim();
    if (operatorValue) {
      return { value: operatorValue, source: "operator-input" };
    }
    if (key === "HARNESS_TEAM_KEY" && input.derivedHarnessTeamKey?.trim()) {
      return {
        value: input.derivedHarnessTeamKey.trim(),
        source: "derived",
      };
    }
    if (
      key === "GITHUB_DISPATCH_TOKEN" &&
      input.derivedGithubDispatchToken?.trim()
    ) {
      return {
        value: input.derivedGithubDispatchToken.trim(),
        source: "derived",
      };
    }
    if (
      key === "LINEAR_WEBHOOK_SECRET" &&
      input.willGenerateLinearWebhookSecret
    ) {
      return { value: "<generated-on-apply>", source: "generated" };
    }
    if (input.existingKeys.has(key)) {
      return { value: undefined, source: "preserve-existing" };
    }
    return { value: undefined, source: "missing-input" };
  };

  for (const key of REQUIRED_VERCEL_BRIDGE_ENV_VARS) {
    const resolved = resolveRequired(key);
    if (resolved.source === "preserve-existing") {
      plan.push({ key, action: "skip", source: "preserve-existing" });
      continue;
    }
    if (resolved.source === "missing-input" || !resolved.value) {
      plan.push({ key, action: "skip", source: "missing-input" });
      continue;
    }
    plan.push({
      key,
      action: input.existingKeys.has(key) ? "update" : "create",
      source: resolved.source,
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

export function resolveVercelBridgeEnvValue(input: {
  key: VercelEnvWritePlanEntry["key"];
  envInput?: VercelBridgeEnvInput;
  derivedHarnessTeamKey?: string;
  derivedGithubDispatchToken?: string;
  generatedLinearWebhookSecret?: string;
}): string | undefined {
  const operatorValue = input.envInput?.[
    input.key as keyof VercelBridgeEnvInput
  ]?.trim();
  if (operatorValue) {
    return operatorValue;
  }
  if (input.key === "HARNESS_TEAM_KEY" && input.derivedHarnessTeamKey?.trim()) {
    return input.derivedHarnessTeamKey.trim();
  }
  if (
    input.key === "GITHUB_DISPATCH_TOKEN" &&
    input.derivedGithubDispatchToken?.trim()
  ) {
    return input.derivedGithubDispatchToken.trim();
  }
  if (
    input.key === "LINEAR_WEBHOOK_SECRET" &&
    input.generatedLinearWebhookSecret?.trim()
  ) {
    return input.generatedLinearWebhookSecret.trim();
  }
  if (input.key in DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS) {
    return DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS[
      input.key as keyof typeof DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS
    ];
  }
  return undefined;
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
  const willGenerateLinearWebhookSecret =
    input.willGenerateLinearWebhookSecret ??
    !input.envInput?.LINEAR_WEBHOOK_SECRET?.trim();
  const envWritePlan = buildEnvWritePlan({
    existingKeys: new Set(envVars.map((env) => env.key)),
    envInput: input.envInput,
    derivedHarnessTeamKey: input.derivedHarnessTeamKey,
    derivedGithubDispatchToken: input.derivedGithubDispatchToken,
    willGenerateLinearWebhookSecret,
  });

  let linearWebhookVerified = false;
  let linearWebhookSecretMode:
    | "automated"
    | "existing-unverified"
    | "manual-copy"
    | undefined;
  const manualSteps: string[] = [];
  if (input.linearApiKey && webhookUrl) {
    const webhookSummary = await summarizeLinearWebhookReadiness({
      linearApiKey: input.linearApiKey,
      webhookUrl,
      teamId: input.linearTeamId,
    });
    linearWebhookVerified = Boolean(webhookSummary.matchingWebhook);
    const secretPlan = await planLinearWebhookSecret({
      linearApiKey: input.linearApiKey,
      webhookUrl,
      linearTeamId: input.linearTeamId,
    });
    linearWebhookSecretMode = secretPlan.mode;
    manualSteps.push(...webhookSummary.manualSteps, ...secretPlan.manualSteps);
  } else {
    manualSteps.push(
      "After Vercel env vars are configured, create or verify the Linear Issue webhook.",
    );
    linearWebhookSecretMode = "manual-copy";
  }

  const githubDispatchSource = input.envInput?.GITHUB_DISPATCH_TOKEN?.trim()
    ? "operator-input"
    : input.derivedGithubDispatchToken?.trim()
      ? "saved-github-token"
      : "missing";

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
    linearWebhookSecretToken: willGenerateLinearWebhookSecret
      ? "generate-on-apply"
      : tokenizeSecretInput(input.envInput?.LINEAR_WEBHOOK_SECRET),
    githubDispatchTokenToken: tokenizeSecretInput(
      input.envInput?.GITHUB_DISPATCH_TOKEN ?? input.derivedGithubDispatchToken,
    ),
    harnessTeamKey:
      input.envInput?.HARNESS_TEAM_KEY ?? input.derivedHarnessTeamKey ?? "",
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
    linearWebhookSecretMode,
    githubDispatchSource,
    readiness,
    manualSteps,
    fingerprint,
    permission: VERCEL_SETUP_ACTIONS.preview.permission,
  };
}
