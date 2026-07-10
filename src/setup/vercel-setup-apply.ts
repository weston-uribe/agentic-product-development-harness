import {
  updateControlPlaneSetupState,
} from "./control-plane-setup-state.js";
import type { VercelBridgeSelection } from "./control-plane-types.js";
import {
  assertRemoteSetupConfirmed,
  assertRemoteSetupFingerprint,
  assertRemoteSetupPermissionScope,
} from "./remote-actions.js";
import { SETUP_PERMISSIONS } from "./permission-model.js";
import { collectRemoteSecretInputs } from "./redact-secrets.js";
import {
  listVercelProjectEnvVars,
  upsertVercelProjectEnvVar,
} from "./vercel-setup-client.js";
import {
  DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS,
  REQUIRED_VERCEL_BRIDGE_ENV_VARS,
} from "./vercel-bridge-readiness.js";
import {
  VERCEL_SETUP_ACTIONS,
  previewVercelBridgeSetup,
  type VercelBridgePlanInput,
  type VercelBridgePreview,
} from "./vercel-setup-plan.js";

export interface VercelBridgeApplyResult {
  actionId: string;
  projectId: string;
  projectName: string;
  writtenEnvKeys: string[];
  skippedEnvKeys: string[];
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

  const knownSecrets = collectRemoteSecretInputs({
    linearApiKey: input.plan.linearApiKey,
    githubToken: input.plan.envInput?.GITHUB_DISPATCH_TOKEN,
  });
  if (input.plan.envInput?.LINEAR_WEBHOOK_SECRET) {
    knownSecrets.push(input.plan.envInput.LINEAR_WEBHOOK_SECRET);
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

    const value =
      entry.key in REQUIRED_VERCEL_BRIDGE_ENV_VARS
        ? input.plan.envInput?.[entry.key as keyof typeof input.plan.envInput]
        : input.plan.envInput?.[entry.key as keyof typeof input.plan.envInput] ??
          DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS[
            entry.key as keyof typeof DEFAULT_VERCEL_BRIDGE_ENV_DEFAULTS
          ];

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

  const selection: VercelBridgeSelection = {
    teamId: input.plan.teamId,
    projectId: preview.selectedProject.id,
    projectName: preview.selectedProject.name,
    productionUrl: preview.productionUrl ?? "",
    webhookUrl: preview.webhookUrl ?? "",
    endpointReachable: preview.endpointReachable,
    envVarPresence: preview.requiredEnvPresence,
    linearWebhookVerified: preview.linearWebhookVerified,
    appliedFingerprint: preview.fingerprint,
    appliedAt: new Date().toISOString(),
    manualComplete: input.manualComplete,
  };

  await updateControlPlaneSetupState({ vercel: selection }, input.cwd);

  const serialized = JSON.stringify({
    actionId: VERCEL_SETUP_ACTIONS.apply.id,
    writtenEnvKeys,
    skippedEnvKeys,
  });
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
    fingerprint: preview.fingerprint,
    permission: VERCEL_SETUP_ACTIONS.apply.permission,
  };
}

export type { VercelBridgePlanInput, VercelBridgePreview };
