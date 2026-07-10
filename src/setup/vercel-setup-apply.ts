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
  createVercelProject,
  createVercelTeam,
  findExistingProjectByName,
  findExistingTeamBySlug,
  listVercelProjectEnvVars,
  listVercelProjects,
  listVercelTeams,
  summarizeRequiredEnvPresence,
  upsertVercelProjectEnvVar,
  VercelEnvVarTypeError,
  type VercelProjectSummary,
} from "./vercel-setup-client.js";
import {
  REQUIRED_VERCEL_BRIDGE_ENV_VARS,
} from "./vercel-bridge-readiness.js";
import {
  VERCEL_SETUP_ACTIONS,
  normalizeVercelBridgePlanInput,
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

export interface VercelBridgeResourceResult {
  id: string;
  name: string;
  outcome: "created" | "reused";
}

export interface VercelBridgeApplyResult {
  actionId: string;
  projectId: string;
  projectName: string;
  team?: VercelBridgeResourceResult;
  project?: VercelBridgeResourceResult;
  writtenEnvKeys: string[];
  skippedEnvKeys: string[];
  linearWebhookSetup: VercelBridgeLinearWebhookSetupResult;
  verified: boolean;
  fingerprint: string;
  permission: typeof SETUP_PERMISSIONS.remoteSecretWrite;
}

async function resolveVercelTeamForApply(input: {
  plan: VercelBridgePlanInput;
  created: string[];
  reused: string[];
}): Promise<{ teamId?: string; teamName?: string; team?: VercelBridgeResourceResult }> {
  const normalized = normalizeVercelBridgePlanInput(input.plan);

  if (normalized.team?.mode !== "create") {
    const teamId = normalized.teamId?.trim() ? normalized.teamId : undefined;
    const teams = await listVercelTeams(normalized.vercelToken);
    const existing = teamId
      ? teams.find((team) => team.id === teamId)
      : undefined;
    if (existing) {
      input.reused.push(`team:${existing.slug}`);
      return {
        teamId: existing.id,
        teamName: existing.name,
        team: {
          id: existing.id,
          name: existing.name,
          outcome: "reused",
        },
      };
    }
    return {
      teamId,
    };
  }

  const slug = normalized.team.teamSlug?.trim();
  if (!slug) {
    throw new Error("New Vercel team requires a team slug.");
  }

  const teams = await listVercelTeams(normalized.vercelToken);
  const existing = findExistingTeamBySlug(teams, slug);
  if (existing) {
    input.reused.push(`team:${existing.slug}`);
    return {
      teamId: existing.id,
      teamName: existing.name,
      team: {
        id: existing.id,
        name: existing.name,
        outcome: "reused",
      },
    };
  }

  const createdTeam = await createVercelTeam(normalized.vercelToken, {
    slug,
    name: normalized.team.teamName,
  });
  input.created.push(`team:${createdTeam.slug}`);
  return {
    teamId: createdTeam.id,
    teamName: createdTeam.name,
    team: {
      id: createdTeam.id,
      name: createdTeam.name,
      outcome: "created",
    },
  };
}

async function resolveVercelProjectForApply(input: {
  plan: VercelBridgePlanInput;
  teamId?: string;
  created: string[];
  reused: string[];
}): Promise<{ project: VercelProjectSummary; projectResult: VercelBridgeResourceResult }> {
  const normalized = normalizeVercelBridgePlanInput(input.plan);
  const projects = await listVercelProjects(normalized.vercelToken, input.teamId);

  if (normalized.project?.mode === "existing") {
    const projectId = normalized.projectId ?? normalized.project.projectId;
    const existing = projects.find((project) => project.id === projectId);
    if (!existing) {
      throw new Error("Selected Vercel project is required for apply.");
    }
    input.reused.push(`project:${existing.name}`);
    return {
      project: existing,
      projectResult: {
        id: existing.id,
        name: existing.name,
        outcome: "reused",
      },
    };
  }

  const projectName = normalized.project?.projectName?.trim();
  if (!projectName) {
    throw new Error("New Vercel project requires a project name.");
  }

  const existing = findExistingProjectByName(projects, projectName);
  if (existing) {
    input.reused.push(`project:${existing.name}`);
    return {
      project: existing,
      projectResult: {
        id: existing.id,
        name: existing.name,
        outcome: "reused",
      },
    };
  }

  const created = await createVercelProject(normalized.vercelToken, {
    name: projectName,
    teamId: input.teamId,
  });
  input.created.push(`project:${created.name}`);
  return {
    project: created,
    projectResult: {
      id: created.id,
      name: created.name,
      outcome: "created",
    },
  };
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

  const normalized = normalizeVercelBridgePlanInput(input.plan);
  const initialPreview = await previewVercelBridgeSetup(normalized);
  assertRemoteSetupFingerprint(input.fingerprint, initialPreview.fingerprint);
  if (initialPreview.validationError) {
    throw new Error(initialPreview.validationError);
  }

  const created: string[] = [];
  const reused: string[] = [];
  const resolvedTeam = await resolveVercelTeamForApply({
    plan: normalized,
    created,
    reused,
  });

  const resolvedProject = await resolveVercelProjectForApply({
    plan: {
      ...normalized,
      teamId: resolvedTeam.teamId,
      projectId:
        normalized.project?.mode === "existing"
          ? (normalized.projectId ?? normalized.project?.projectId)
          : undefined,
    },
    teamId: resolvedTeam.teamId,
    created,
    reused,
  });

  const planForApply: VercelBridgePlanInput = {
    ...normalized,
    teamId: resolvedTeam.teamId,
    projectId: resolvedProject.project.id,
    projectName: resolvedProject.project.name,
    team: {
      mode: "existing",
      teamId: resolvedTeam.teamId ?? "",
    },
    project: {
      mode: "existing",
      projectId: resolvedProject.project.id,
      projectName: resolvedProject.project.name,
    },
  };

  const preview = await previewVercelBridgeSetup(planForApply);
  if (preview.validationError) {
    throw new Error(preview.validationError);
  }
  if (!preview.selectedProject) {
    throw new Error("Vercel project must be selected before apply.");
  }
  if (!preview.webhookUrl) {
    throw new Error(
      "Vercel production URL could not be resolved for the selected project. Deploy the project before applying settings.",
    );
  }

  const generatedLinearWebhookSecret =
    normalized.envInput?.LINEAR_WEBHOOK_SECRET?.trim() ??
    generateLinearWebhookSecret();

  let linearWebhookSetup: VercelBridgeLinearWebhookSetupResult = {
    mode: "manual-copy",
    manualSteps: [],
    manualCopySecret: undefined,
  };

  if (normalized.linearApiKey?.trim()) {
    const ensured = await ensureLinearIssueWebhook({
      linearApiKey: normalized.linearApiKey,
      webhookUrl: preview.webhookUrl,
      linearTeamId: normalized.linearTeamId,
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
    linearApiKey: normalized.linearApiKey,
    githubToken:
      normalized.envInput?.GITHUB_DISPATCH_TOKEN ??
      normalized.derivedGithubDispatchToken,
  });
  knownSecrets.push(generatedLinearWebhookSecret);
  if (normalized.envInput?.GITHUB_DISPATCH_TOKEN) {
    knownSecrets.push(normalized.envInput.GITHUB_DISPATCH_TOKEN);
  }
  if (normalized.derivedGithubDispatchToken) {
    knownSecrets.push(normalized.derivedGithubDispatchToken);
  }

  const existingEnv = await listVercelProjectEnvVars(
    normalized.vercelToken,
    preview.selectedProject.id,
    resolvedTeam.teamId,
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
      envInput: normalized.envInput,
      derivedHarnessTeamKey: normalized.derivedHarnessTeamKey,
      derivedGithubDispatchToken: normalized.derivedGithubDispatchToken,
      generatedLinearWebhookSecret,
    });

    if (!value?.trim()) {
      skippedEnvKeys.push(entry.key);
      continue;
    }

    const existing = existingByKey.get(entry.key);
    try {
      await upsertVercelProjectEnvVar(normalized.vercelToken, {
        projectId: preview.selectedProject.id,
        teamId: resolvedTeam.teamId,
        key: entry.key,
        value: value.trim(),
        existingEnv: existing,
      });
    } catch (error) {
      if (error instanceof VercelEnvVarTypeError) {
        throw error;
      }
      throw error;
    }
    writtenEnvKeys.push(entry.key);
  }

  const postWriteEnv = await listVercelProjectEnvVars(
    normalized.vercelToken,
    preview.selectedProject.id,
    resolvedTeam.teamId,
  );
  const requiredEnvPresence = summarizeRequiredEnvPresence(postWriteEnv);

  let linearWebhookVerified = preview.linearWebhookVerified;
  if (normalized.linearApiKey?.trim()) {
    const webhookSummary = await summarizeLinearWebhookReadiness({
      linearApiKey: normalized.linearApiKey,
      webhookUrl: preview.webhookUrl,
      teamId: normalized.linearTeamId,
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
    teamId: resolvedTeam.teamId,
    teamName: resolvedTeam.teamName,
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
    team: resolvedTeam.team,
    project: resolvedProject.projectResult,
    writtenEnvKeys,
    skippedEnvKeys,
    linearWebhookSetup,
    verified,
    fingerprint: preview.fingerprint,
    permission: VERCEL_SETUP_ACTIONS.apply.permission,
  };
}

export type { VercelBridgePlanInput, VercelBridgePreview };
