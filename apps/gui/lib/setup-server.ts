import "server-only";

import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";
import {
  applyLocalSetupFiles,
  previewLocalSetupFiles,
  type LocalSetupApplyResult,
  type LocalSetupFormPayload,
  type LocalSetupPreviewResult,
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
  return deriveFirstRunReadiness({
    summary,
    remoteSummary,
    staleSmokeDiagnostics: remoteSummary.staleSmokeDiagnostics,
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
};

