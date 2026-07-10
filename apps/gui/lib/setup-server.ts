import "server-only";

import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";
import {
  applyLocalSetupFiles,
  applyConnectServicesEnv,
  previewConnectServicesEnv,
  previewLocalSetupFiles,
  type LocalSetupApplyResult,
  type LocalSetupFormPayload,
  type LocalSetupPreviewResult,
  type LocalEnvFormInput,
} from "@harness/setup/local-apply-actions";
import { loadConfigFormDefaults } from "@harness/setup/config-local-editor";
import { readExistingEnvFile } from "@harness/setup/env-merge";
import { resolveLocalFilePaths } from "@harness/setup/setup-state";
import {
  parseGitHubRepoSlug,
  readGitRemoteOrigin,
} from "@harness/setup/harness-dispatch-repo";
import {
  deriveFirstRunReadiness,
  type FirstRunReadiness,
} from "@harness/setup/first-run-readiness";
import {
  getSetupStateSummary,
  type SetupGuiViewModel,
} from "@harness/setup/gui-view-model";
import { createLiveGitHubRemoteSetupProvider } from "@harness/setup/github-remote-setup-live";
import type { GitHubRemoteSetupProvider } from "@harness/setup/github-remote-provider";
import type { HarnessSecretOperatorInput } from "@harness/setup/harness-secret-setup";
import {
  applyRemoteHarnessSecrets,
  applyRemoteTargetWorkflow,
  previewRemoteHarnessSecrets,
  previewRemoteTargetWorkflow,
  sanitizeRemoteHarnessSecretPreview,
} from "@harness/setup/remote-apply-actions";
import {
  buildRemoteSetupSummary,
  type RemoteSetupSummary,
} from "@harness/setup/remote-setup-summary";
import { collectRemoteSecretInputs } from "@harness/setup/redact-secrets";
import {
  loadGithubTokenFromEnvLocal,
  hasGithubTokenConfigured,
} from "@harness/setup/setup-github-auth";
import {
  loadControlPlaneReadinessContext,
} from "@harness/setup/control-plane-readiness-server";
import {
  applyLinearSetup,
  type LinearSetupApplyResult,
  type LinearSetupPlanInput,
  type LinearSetupPreview,
} from "@harness/setup/linear-setup-apply";
import { buildLinearSetupSummary } from "@harness/setup/linear-setup-summary";
import {
  createLinearSetupClient,
  listLinearProjects,
  listLinearTeams,
} from "@harness/setup/linear-setup-client";
import { previewLinearSetup } from "@harness/setup/linear-setup-plan";
import {
  applyVercelBridgeSetup,
  type VercelBridgeApplyResult,
  type VercelBridgePlanInput,
  type VercelBridgePreview,
} from "@harness/setup/vercel-setup-apply";
import { buildVercelSetupSummary } from "@harness/setup/vercel-setup-summary";
import { previewVercelBridgeSetup } from "@harness/setup/vercel-setup-plan";
import { loadSecretFromEnvLocal } from "@harness/setup/service-verification";
import type {
  RemoteHarnessSecretApplyResult,
  RemoteHarnessSecretPreview,
  RemoteTargetWorkflowApplyResult,
  RemoteTargetWorkflowPreview,
} from "@harness/setup/remote-actions";

export interface RemoteSecretFormPayload {
  linearApiKey?: string;
  cursorApiKey?: string;
  harnessGithubToken?: string;
  manualHarnessDispatchRepo?: string;
}

export interface RemoteTargetWorkflowFormPayload {
  repoConfigId: string;
  targetRepo: string;
  productionBranch: string;
  manualHarnessDispatchRepo?: string;
}

function resolveCwd(): string {
  return resolveHarnessRepoRoot();
}

async function resolveRemoteProvider(): Promise<
  GitHubRemoteSetupProvider | undefined
> {
  const token = await loadGithubTokenFromEnvLocal({ cwd: resolveCwd() });
  if (!hasGithubTokenConfigured(token)) {
    return undefined;
  }
  return createLiveGitHubRemoteSetupProvider(token!);
}

function toOperatorInput(
  payload: RemoteSecretFormPayload,
): HarnessSecretOperatorInput {
  return {
    linearApiKey: payload.linearApiKey,
    cursorApiKey: payload.cursorApiKey,
    githubToken: payload.harnessGithubToken,
  };
}

export async function loadSetupSummary(): Promise<SetupGuiViewModel> {
  return getSetupStateSummary({ cwd: resolveCwd() });
}

export async function loadRemoteSetupSummary(): Promise<RemoteSetupSummary> {
  const cwd = resolveCwd();
  const provider = await resolveRemoteProvider();
  return buildRemoteSetupSummary({ cwd, provider });
}

export async function loadFirstRunReadiness(): Promise<FirstRunReadiness> {
  const [summary, remoteSummary] = await Promise.all([
    loadSetupSummary(),
    loadRemoteSetupSummary(),
  ]);
  const controlPlaneContext = await loadControlPlaneReadinessContext(
    resolveCwd(),
    summary,
  );
  return deriveFirstRunReadiness({
    summary,
    remoteSummary,
    staleSmokeDiagnostics: remoteSummary.staleSmokeDiagnostics,
    controlPlaneContext,
  });
}

export async function loadSetupFormDefaults(): Promise<{
  env: {
    harnessConfigPath: string;
    githubDispatchRepository: string;
    suggestedHarnessDispatchRepo?: string;
    secretPresence: {
      LINEAR_API_KEY: boolean;
      CURSOR_API_KEY: boolean;
      GITHUB_TOKEN: boolean;
      VERCEL_TOKEN: boolean;
    };
  };
  config: Awaited<ReturnType<typeof loadConfigFormDefaults>>;
}> {
  const cwd = resolveCwd();
  const paths = resolveLocalFilePaths(cwd);
  const existingEnv = await readExistingEnvFile(paths);
  const config = await loadConfigFormDefaults({ cwd });
  const gitRemoteOriginUrl = await readGitRemoteOrigin(cwd);
  const suggestedHarnessDispatchRepo = gitRemoteOriginUrl
    ? parseGitHubRepoSlug(gitRemoteOriginUrl) ?? undefined
    : undefined;

  return {
    env: {
      harnessConfigPath:
        existingEnv?.values.HARNESS_CONFIG_PATH ?? ".harness/config.local.json",
      githubDispatchRepository:
        existingEnv?.values.GITHUB_DISPATCH_REPOSITORY ?? "",
      suggestedHarnessDispatchRepo,
      secretPresence: {
        LINEAR_API_KEY: existingEnv?.presence.LINEAR_API_KEY ?? false,
        CURSOR_API_KEY: existingEnv?.presence.CURSOR_API_KEY ?? false,
        GITHUB_TOKEN: existingEnv?.presence.GITHUB_TOKEN ?? false,
        VERCEL_TOKEN: existingEnv?.presence.VERCEL_TOKEN ?? false,
      },
    },
    config,
  };
}

export async function previewLocalFiles(
  payload: LocalSetupFormPayload,
): Promise<LocalSetupPreviewResult> {
  return previewLocalSetupFiles({
    cwd: resolveCwd(),
    payload,
  });
}

export async function applyLocalFiles(options: {
  payload: LocalSetupFormPayload;
  confirmed: boolean;
  fingerprint: string;
}): Promise<{
  apply: LocalSetupApplyResult;
  summary: SetupGuiViewModel;
}> {
  const cwd = resolveCwd();
  const apply = await applyLocalSetupFiles({
    cwd,
    payload: options.payload,
    confirmed: options.confirmed,
    fingerprint: options.fingerprint,
  });
  const summary = await getSetupStateSummary({ cwd });
  return { apply, summary };
}

export async function previewHarnessSecretsRemote(
  payload: RemoteSecretFormPayload,
): Promise<RemoteHarnessSecretPreview> {
  const operatorInput = toOperatorInput(payload);
  const knownSecrets = collectRemoteSecretInputs(operatorInput);
  const preview = await previewRemoteHarnessSecrets({
    cwd: resolveCwd(),
    operatorInput,
    manualHarnessDispatchRepo: payload.manualHarnessDispatchRepo,
    provider: await resolveRemoteProvider(),
  });
  return sanitizeRemoteHarnessSecretPreview(preview, knownSecrets);
}

export async function applyHarnessSecretsRemote(options: {
  payload: RemoteSecretFormPayload;
  confirmed: boolean;
  fingerprint: string;
}): Promise<{
  apply: RemoteHarnessSecretApplyResult;
  summary: RemoteSetupSummary;
}> {
  const operatorInput = toOperatorInput(options.payload);
  const apply = await applyRemoteHarnessSecrets({
    cwd: resolveCwd(),
    operatorInput,
    manualHarnessDispatchRepo: options.payload.manualHarnessDispatchRepo,
    confirmed: options.confirmed,
    fingerprint: options.fingerprint,
    provider: await resolveRemoteProvider(),
  });
  const summary = await loadRemoteSetupSummary();
  return { apply, summary };
}

export async function previewTargetWorkflowRemote(
  payload: RemoteTargetWorkflowFormPayload,
): Promise<RemoteTargetWorkflowPreview> {
  return previewRemoteTargetWorkflow({
    cwd: resolveCwd(),
    repoConfigId: payload.repoConfigId,
    targetRepo: payload.targetRepo,
    productionBranch: payload.productionBranch,
    manualHarnessDispatchRepo: payload.manualHarnessDispatchRepo,
    provider: await resolveRemoteProvider(),
  });
}

export async function applyTargetWorkflowRemote(options: {
  payload: RemoteTargetWorkflowFormPayload;
  confirmed: boolean;
  fingerprint: string;
}): Promise<{
  apply: RemoteTargetWorkflowApplyResult;
  summary: RemoteSetupSummary;
}> {
  const apply = await applyRemoteTargetWorkflow({
    cwd: resolveCwd(),
    repoConfigId: options.payload.repoConfigId,
    targetRepo: options.payload.targetRepo,
    productionBranch: options.payload.productionBranch,
    manualHarnessDispatchRepo: options.payload.manualHarnessDispatchRepo,
    confirmed: options.confirmed,
    fingerprint: options.fingerprint,
    provider: await resolveRemoteProvider(),
  });
  const summary = await loadRemoteSetupSummary();
  return { apply, summary };
}

async function loadLinearApiKey(cwd: string): Promise<string | undefined> {
  return loadSecretFromEnvLocal({ cwd, key: "LINEAR_API_KEY" });
}

async function loadVercelToken(cwd: string): Promise<string | undefined> {
  return loadSecretFromEnvLocal({ cwd, key: "VERCEL_TOKEN" });
}

export async function loadLinearSetupSummary() {
  return buildLinearSetupSummary(resolveCwd());
}

export async function loadLinearWorkspaceOptions(): Promise<{
  teams: Awaited<ReturnType<typeof listLinearTeams>>;
  projects: Awaited<ReturnType<typeof listLinearProjects>>;
}> {
  const cwd = resolveCwd();
  const linearApiKey = await loadLinearApiKey(cwd);
  if (!linearApiKey?.trim()) {
    throw new Error("LINEAR_API_KEY is required to load Linear workspace options.");
  }
  const client = createLinearSetupClient(linearApiKey);
  const [teams, projects] = await Promise.all([
    listLinearTeams(client),
    listLinearProjects(client),
  ]);
  return { teams, projects };
}

export async function loadVercelSetupSummary() {
  return buildVercelSetupSummary(resolveCwd());
}

export async function previewLinearSetupRemote(
  payload: Omit<LinearSetupPlanInput, "linearApiKey"> & {
    linearApiKey?: string;
  },
): Promise<LinearSetupPreview> {
  const cwd = resolveCwd();
  const linearApiKey =
    payload.linearApiKey ?? (await loadLinearApiKey(cwd)) ?? "";
  return previewLinearSetup({
    ...payload,
    linearApiKey,
  });
}

export async function applyLinearSetupRemote(options: {
  plan: Omit<LinearSetupPlanInput, "linearApiKey"> & { linearApiKey?: string };
  confirmed: boolean;
  fingerprint: string;
}): Promise<{
  apply: LinearSetupApplyResult;
  summary: Awaited<ReturnType<typeof buildLinearSetupSummary>>;
}> {
  const cwd = resolveCwd();
  const linearApiKey =
    options.plan.linearApiKey ?? (await loadLinearApiKey(cwd)) ?? "";
  const apply = await applyLinearSetup({
    plan: { ...options.plan, linearApiKey },
    confirmed: options.confirmed,
    fingerprint: options.fingerprint,
    cwd,
  });
  const summary = await buildLinearSetupSummary(cwd);
  return { apply, summary };
}

export async function previewVercelBridgeRemote(
  payload: Omit<VercelBridgePlanInput, "vercelToken" | "linearApiKey"> & {
    vercelToken?: string;
    linearApiKey?: string;
  },
): Promise<VercelBridgePreview> {
  const cwd = resolveCwd();
  const vercelToken = payload.vercelToken ?? (await loadVercelToken(cwd)) ?? "";
  const linearApiKey = payload.linearApiKey ?? (await loadLinearApiKey(cwd));
  return previewVercelBridgeSetup({
    ...payload,
    vercelToken,
    linearApiKey,
  });
}

export async function applyVercelBridgeRemote(options: {
  plan: Omit<VercelBridgePlanInput, "vercelToken" | "linearApiKey"> & {
    vercelToken?: string;
    linearApiKey?: string;
  };
  confirmed: boolean;
  fingerprint: string;
  manualComplete?: boolean;
}): Promise<{
  apply: VercelBridgeApplyResult;
  summary: Awaited<ReturnType<typeof buildVercelSetupSummary>>;
}> {
  const cwd = resolveCwd();
  const vercelToken =
    options.plan.vercelToken ?? (await loadVercelToken(cwd)) ?? "";
  const linearApiKey =
    options.plan.linearApiKey ?? (await loadLinearApiKey(cwd));
  const apply = await applyVercelBridgeSetup({
    plan: { ...options.plan, vercelToken, linearApiKey },
    confirmed: options.confirmed,
    fingerprint: options.fingerprint,
    manualComplete: options.manualComplete,
    cwd,
  });
  const summary = await buildVercelSetupSummary(cwd);
  return { apply, summary };
}

export async function previewConnectServicesRemote(
  env: LocalEnvFormInput,
): Promise<Awaited<ReturnType<typeof previewConnectServicesEnv>>> {
  return previewConnectServicesEnv({ cwd: resolveCwd(), env });
}

export async function applyConnectServicesRemote(options: {
  env: LocalEnvFormInput;
  confirmed: boolean;
  fingerprint: string;
}): Promise<{ summary: SetupGuiViewModel }> {
  const cwd = resolveCwd();
  await applyConnectServicesEnv({
    cwd,
    env: options.env,
    confirmed: options.confirmed,
    fingerprint: options.fingerprint,
  });
  const summary = await getSetupStateSummary({ cwd });
  return { summary };
}

export type {
  SetupGuiViewModel,
  LocalSetupFormPayload,
  LocalSetupPreviewResult,
  RemoteSetupSummary,
  RemoteHarnessSecretPreview,
  RemoteHarnessSecretApplyResult,
  RemoteTargetWorkflowPreview,
  RemoteTargetWorkflowApplyResult,
  FirstRunReadiness,
  LinearSetupPreview,
  LinearSetupApplyResult,
  VercelBridgePreview,
  VercelBridgeApplyResult,
};

