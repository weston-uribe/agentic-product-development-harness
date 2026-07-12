import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseGitHubRepoUrl } from "../github/base-branch.js";
import { readExistingEnvFile } from "./env-merge.js";
import {
  formatHarnessDispatchRepo,
  resolveHarnessDispatchRepo,
  type HarnessDispatchRepoResolution,
} from "./harness-dispatch-repo.js";
import { generateGitHubSecretInstructions } from "./generated-instructions.js";
import {
  HARNESS_ACTIONS_SECRET_NAMES,
  REMOTE_SETUP_ACTIONS,
  type HarnessActionsSecretName,
  type HarnessSecretStatusEntry,
  type HarnessSecretWritePlanEntry,
  type RemoteAccessStatus,
} from "./remote-actions.js";
import {
  computeHarnessSecretFingerprint,
  tokenizeSecretInput,
} from "./remote-preview-fingerprint.js";
import { getLocalFileBaseline } from "./env-merge.js";
import { resolveLocalFilePaths } from "./setup-state.js";

export interface HarnessSecretOperatorInput {
  linearApiKey?: string;
  cursorApiKey?: string;
  githubToken?: string;
}

export interface HarnessSecretSetupOptions {
  cwd?: string;
  operatorInput?: HarnessSecretOperatorInput;
  manualHarnessDispatchRepo?: string;
  secretStatuses?: HarnessSecretStatusEntry[];
  repoAccess?: RemoteAccessStatus;
}

export async function readValidatedConfigLocalBytes(
  cwd?: string,
): Promise<{ bytes: Buffer; hash: string }> {
  const paths = resolveLocalFilePaths(cwd);
  const bytes = await readFile(paths.configLocal);
  const content = bytes.toString("utf8");
  JSON.parse(content);
  const hash = createHash("sha256").update(bytes).digest("hex");
  return { bytes, hash };
}

export function generateHarnessConfigJsonB64(configBytes: Buffer): string {
  return configBytes.toString("base64");
}

export function buildHarnessSecretWritePlan(input: {
  operatorInput?: HarnessSecretOperatorInput;
  configLocalExists: boolean;
  secretStatuses?: HarnessSecretStatusEntry[];
}): HarnessSecretWritePlanEntry[] {
  const statusByName = new Map(
    (input.secretStatuses ?? []).map((entry) => [entry.name, entry.status]),
  );

  const plan: HarnessSecretWritePlanEntry[] = [];

  for (const name of HARNESS_ACTIONS_SECRET_NAMES) {
    if (name === "HARNESS_CONFIG_JSON_B64") {
      plan.push({
        name,
        action: input.configLocalExists ? "create" : "skip",
        source: input.configLocalExists ? "generated-config-b64" : "missing-input",
      });
      continue;
    }

    const operatorValue =
      name === "LINEAR_API_KEY"
        ? input.operatorInput?.linearApiKey
        : name === "CURSOR_API_KEY"
          ? input.operatorInput?.cursorApiKey
          : input.operatorInput?.githubToken;

    if (operatorValue?.trim()) {
      plan.push({
        name,
        action:
          statusByName.get(name) === "present" ? "update" : "create",
        source: "operator-input",
      });
      continue;
    }

    if (statusByName.get(name) === "present") {
      plan.push({
        name,
        action: "skip",
        source: "preserve-existing",
      });
      continue;
    }

    plan.push({
      name,
      action: "skip",
      source: "missing-input",
    });
  }

  return plan;
}

export function summarizeHarnessSecretPreview(input: {
  harnessDispatchRepo: HarnessDispatchRepoResolution;
  secretWritePlan: HarnessSecretWritePlanEntry[];
}): string {
  const repo = formatHarnessDispatchRepo(input.harnessDispatchRepo);
  const keyNames = input.secretWritePlan
    .filter((entry) => entry.action !== "skip")
    .map((entry) => entry.name);

  if (keyNames.length === 0) {
    return `No harness repo Actions secrets would be written for ${repo}.`;
  }

  return `Would write harness repo Actions secrets for ${repo}: ${keyNames.join(", ")}. Secret values are never shown in previews.`;
}

export async function buildHarnessSecretPreviewContext(options: {
  cwd?: string;
  operatorInput?: HarnessSecretOperatorInput;
  manualHarnessDispatchRepo?: string;
  secretStatuses?: HarnessSecretStatusEntry[];
  repoAccess?: RemoteAccessStatus;
}): Promise<{
  harnessDispatchRepo: HarnessDispatchRepoResolution;
  configLocalExists: boolean;
  configLocalHash: string;
  secretWritePlan: HarnessSecretWritePlanEntry[];
  validationError?: string;
}> {
  const harnessDispatchRepo = await resolveHarnessDispatchRepo({
    cwd: options.cwd,
    manualRepo: options.manualHarnessDispatchRepo,
  });

  let configLocalExists = false;
  let configLocalHash = "";
  let validationError: string | undefined;

  try {
    const config = await readValidatedConfigLocalBytes(options.cwd);
    configLocalExists = true;
    configLocalHash = config.hash;
  } catch (error) {
    validationError =
      error instanceof Error ? error.message : String(error);
  }

  const secretWritePlan = buildHarnessSecretWritePlan({
    operatorInput: options.operatorInput,
    configLocalExists,
    secretStatuses: options.secretStatuses,
  });

  return {
    harnessDispatchRepo,
    configLocalExists,
    configLocalHash,
    secretWritePlan,
    validationError,
  };
}

export async function previewHarnessSecretSetup(
  options: HarnessSecretSetupOptions,
): Promise<{
  harnessDispatchRepo: HarnessDispatchRepoResolution;
  configLocalHash: string;
  secretWritePlan: HarnessSecretWritePlanEntry[];
  fingerprint: string;
  previewSummary: string;
  manualInstructions: string[];
  validationError?: string;
}> {
  const context = await buildHarnessSecretPreviewContext(options);
  const harnessDispatchRepoSlug = formatHarnessDispatchRepo(
    context.harnessDispatchRepo,
  );
  const manualInstructions = generateGitHubSecretInstructions({
    harnessRepo: harnessDispatchRepoSlug,
  }).steps;

  const fingerprint = computeHarnessSecretFingerprint({
    actionId: REMOTE_SETUP_ACTIONS.previewHarnessSecrets.id,
    permissionScope: REMOTE_SETUP_ACTIONS.previewHarnessSecrets.permission.scope,
    harnessDispatchRepo: harnessDispatchRepoSlug,
    harnessDispatchRepoSource: context.harnessDispatchRepo.source,
    secretWritePlan: context.secretWritePlan,
    linearApiKeyToken: tokenizeSecretInput(options.operatorInput?.linearApiKey),
    cursorApiKeyToken: tokenizeSecretInput(options.operatorInput?.cursorApiKey),
    harnessGithubTokenToken: tokenizeSecretInput(
      options.operatorInput?.githubToken,
    ),
    configLocalHash: context.configLocalHash,
  });

  return {
    harnessDispatchRepo: context.harnessDispatchRepo,
    configLocalHash: context.configLocalHash,
    secretWritePlan: context.secretWritePlan,
    fingerprint,
    previewSummary: summarizeHarnessSecretPreview({
      harnessDispatchRepo: context.harnessDispatchRepo,
      secretWritePlan: context.secretWritePlan,
    }),
    manualInstructions,
    validationError: context.validationError,
  };
}

export async function getConfigLocalBaselineHash(cwd?: string): Promise<string> {
  const paths = resolveLocalFilePaths(cwd);
  return getLocalFileBaseline(paths.configLocal);
}

export function targetRepoSlugFromUrl(targetRepo: string): string | null {
  const parsed = parseGitHubRepoUrl(targetRepo);
  if (!parsed) {
    return null;
  }
  return `${parsed.owner}/${parsed.repo}`;
}

export interface ManualHarnessSecretCopyValues {
  values: Partial<Record<HarnessActionsSecretName, string>>;
  missing: HarnessActionsSecretName[];
}

export async function buildManualHarnessSecretCopyValues(options?: {
  cwd?: string;
}): Promise<ManualHarnessSecretCopyValues> {
  const cwd = options?.cwd;
  const paths = resolveLocalFilePaths(cwd);
  const existingEnv = await readExistingEnvFile(paths);
  const values: Partial<Record<HarnessActionsSecretName, string>> = {};
  const missing: HarnessActionsSecretName[] = [];

  try {
    const { bytes } = await readValidatedConfigLocalBytes(cwd);
    values.HARNESS_CONFIG_JSON_B64 = generateHarnessConfigJsonB64(bytes);
  } catch {
    missing.push("HARNESS_CONFIG_JSON_B64");
  }

  const linearApiKey = existingEnv?.values.LINEAR_API_KEY?.trim();
  if (linearApiKey) {
    values.LINEAR_API_KEY = linearApiKey;
  } else {
    missing.push("LINEAR_API_KEY");
  }

  const cursorApiKey = existingEnv?.values.CURSOR_API_KEY?.trim();
  if (cursorApiKey) {
    values.CURSOR_API_KEY = cursorApiKey;
  } else {
    missing.push("CURSOR_API_KEY");
  }

  const githubToken = existingEnv?.values.GITHUB_TOKEN?.trim();
  if (githubToken) {
    values.HARNESS_GITHUB_TOKEN = githubToken;
  } else {
    missing.push("HARNESS_GITHUB_TOKEN");
  }

  return { values, missing };
}
