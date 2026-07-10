import {
  updateControlPlaneSetupState,
} from "./control-plane-setup-state.js";
import type { VercelBridgeSelection } from "./control-plane-types.js";
import {
  ensureLinearIssueWebhook,
  generateLinearWebhookSecret,
  type LinearWebhookSecretMode,
} from "./linear-webhook-secret.js";
import { summarizeLinearWebhookReadiness } from "./linear-setup-plan.js";
import {
  assertRemoteSetupConfirmed,
  assertRemoteSetupFingerprint,
  assertRemoteSetupPermissionScope,
} from "./remote-actions.js";
import { SETUP_PERMISSIONS } from "./permission-model.js";
import { collectRemoteSecretInputs } from "./redact-secrets.js";
import {
  listVercelProjectEnvVars,
  summarizeRequiredEnvPresence,
  upsertVercelProjectEnvVar,
} from "./vercel-setup-client.js";
import {
  REQUIRED_VERCEL_BRIDGE_ENV_VARS,
} from "./vercel-bridge-readiness.js";
import {
  VERCEL_SETUP_ACTIONS,
  previewVercelBridgeSetup,
  resolveVercelBridgeEnvValue,
  type VercelBridgePlanInput,
  type VercelBridgePreview,
} from "./vercel-setup-plan.js";

export interface VercelBridgeLinearWebhookSetupResult {
  mode: LinearWebhookSecretMode;
  manualSteps: string[];
  manualCopySecret?: string;
}

export interface VercelBridgeApplyResult {
  actionId: string;
  projectId: string;
  projectName: string;
  writtenEnvKeys: string[];
  skippedEnvKeys: string[];
  linearWebhookSetup: VercelBridgeLinearWebhookSetupResult;
  verified: boolean;
  fingerprint: string;
  permission: typeof SETUP_PERMISSIONS.remoteSecretWrite;
}

export async function applyVercelBridgeSetup(input: {
  plan: VercelBridgePlanInput;
  confirmed: boolean;
  fingerprint: string;
  manualComplete?: boolean;
  cwd?: string;
}): Promise<VercelBridgeApplyResult> {
  assertRemoteSetupConfirmed(input.confirmed);
  assertRemoteSetupPermissionScope(
    VERCEL_SETUP_ACTIONS.apply.permission.scope,
    SETUP_PERMISSIONS.remoteSecretWrite.scope,
  );

  const preview = await previewVercelBridgeSetup(input.plan);
  assertRemoteSetupFingerprint(input.fingerprint, preview.fingerprint);
  if (preview.validationError) {
    throw new Error(preview.validationError);
  }
  if (!preview.selectedProject) {
    throw new Error("Vercel bridge project must be selected before apply.");
  }
  if (!preview.webhookUrl) {
    throw new Error(
      "Vercel bridge webhook URL could not be resolved for the selected project.",
    );
  }

  const generatedLinearWebhookSecret =
    input.plan.envInput?.LINEAR_WEBHOOK_SECRET?.trim() ??
    generateLinearWebhookSecret();

  let linearWebhookSetup: VercelBridgeLinearWebhookSetupResult = {
    mode: "manual-copy",
    manualSteps: [],
    manualCopySecret: undefined,
  };

  if (input.plan.linearApiKey?.trim()) {
    const ensured = await ensureLinearIssueWebhook({
      linearApiKey: input.plan.linearApiKey,
      webhookUrl: preview.webhookUrl,
      linearTeamId: input.plan.linearTeamId,
      secret: generatedLinearWebhookSecret,
    });
    linearWebhookSetup = {
      mode: ensured.mode,
      manualSteps: ensured.manualSteps,
      manualCopySecret:
        ensured.mode === "automated" ? undefined : ensured.secret,
    };
  } else {
    linearWebhookSetup = {
      mode: "manual-copy",
      manualSteps: [
        "Add LINEAR_API_KEY in Step 1 before automated Linear webhook setup can run.",
        "Copy the generated webhook secret into Linear when prompted.",
      ],
      manualCopySecret: generatedLinearWebhookSecret,
    };
  }

  const knownSecrets = collectRemoteSecretInputs({
    linearApiKey: input.plan.linearApiKey,
    githubToken:
      input.plan.envInput?.GITHUB_DISPATCH_TOKEN ??
      input.plan.derivedGithubDispatchToken,
  });
  knownSecrets.push(generatedLinearWebhookSecret);
  if (input.plan.envInput?.GITHUB_DISPATCH_TOKEN) {
    knownSecrets.push(input.plan.envInput.GITHUB_DISPATCH_TOKEN);
  }
  if (input.plan.derivedGithubDispatchToken) {
    knownSecrets.push(input.plan.derivedGithubDispatchToken);
  }

  const existingEnv = await listVercelProjectEnvVars(
    input.plan.vercelToken,
    preview.selectedProject.id,
    input.plan.teamId,
  );
  const existingByKey = new Map(existingEnv.map((env) => [env.key, env]));

  const writtenEnvKeys: string[] = [];
  const skippedEnvKeys: string[] = [];

  for (const entry of preview.envWritePlan) {
    if (entry.action === "skip") {
      skippedEnvKeys.push(entry.key);
      continue;
    }

    const value = resolveVercelBridgeEnvValue({
      key: entry.key,
      envInput: input.plan.envInput,
      derivedHarnessTeamKey: input.plan.derivedHarnessTeamKey,
      derivedGithubDispatchToken: input.plan.derivedGithubDispatchToken,
      generatedLinearWebhookSecret,
    });

    if (!value?.trim()) {
      skippedEnvKeys.push(entry.key);
      continue;
    }

    const existing = existingByKey.get(entry.key);
    await upsertVercelProjectEnvVar(input.plan.vercelToken, {
      projectId: preview.selectedProject.id,
      teamId: input.plan.teamId,
      key: entry.key,
      value: value.trim(),
      existingEnvId: existing?.id,
    });
    writtenEnvKeys.push(entry.key);
  }

  const postWriteEnv = await listVercelProjectEnvVars(
    input.plan.vercelToken,
    preview.selectedProject.id,
    input.plan.teamId,
  );
  const requiredEnvPresence = summarizeRequiredEnvPresence(postWriteEnv);

  let linearWebhookVerified = preview.linearWebhookVerified;
  if (input.plan.linearApiKey?.trim()) {
    const webhookSummary = await summarizeLinearWebhookReadiness({
      linearApiKey: input.plan.linearApiKey,
      webhookUrl: preview.webhookUrl,
      teamId: input.plan.linearTeamId,
    });
    linearWebhookVerified = Boolean(webhookSummary.matchingWebhook);
  }

  const verified =
    REQUIRED_VERCEL_BRIDGE_ENV_VARS.every(
      (key) => requiredEnvPresence[key] === "present",
    ) &&
    (linearWebhookVerified ||
      input.manualComplete === true ||
      linearWebhookSetup.mode === "automated");

  const selection: VercelBridgeSelection = {
    teamId: input.plan.teamId,
    projectId: preview.selectedProject.id,
    projectName: preview.selectedProject.name,
    productionUrl: preview.productionUrl ?? "",
    webhookUrl: preview.webhookUrl ?? "",
    endpointReachable: preview.endpointReachable,
    envVarPresence: requiredEnvPresence,
    linearWebhookVerified,
    appliedFingerprint: preview.fingerprint,
    appliedAt: new Date().toISOString(),
    manualComplete: input.manualComplete,
  };

  await updateControlPlaneSetupState({ vercel: selection }, input.cwd);

  const resultPayload = {
    actionId: VERCEL_SETUP_ACTIONS.apply.id,
    writtenEnvKeys,
    skippedEnvKeys,
    linearWebhookSetup: {
      mode: linearWebhookSetup.mode,
      manualSteps: linearWebhookSetup.manualSteps,
    },
    verified,
  };
  const serialized = JSON.stringify(resultPayload);
  for (const secret of knownSecrets) {
    if (serialized.includes(secret)) {
      throw new Error("Vercel bridge apply result leaked secret material");
    }
  }

  return {
    actionId: VERCEL_SETUP_ACTIONS.apply.id,
    projectId: preview.selectedProject.id,
    projectName: preview.selectedProject.name,
    writtenEnvKeys,
    skippedEnvKeys,
    linearWebhookSetup,
    verified,
    fingerprint: preview.fingerprint,
    permission: VERCEL_SETUP_ACTIONS.apply.permission,
  };
}

export type { VercelBridgePlanInput, VercelBridgePreview };
