import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { SETUP_PERMISSIONS } from "./permission-model.js";
import {
  collectMergedSecrets,
  generateMergedEnvContent,
  mergeEnvInput,
  readExistingEnvFile,
  redactEnvContent,
  summarizeManagedKeyPresence,
} from "./env-merge.js";
import { writeConfigLocal } from "./config-writer.js";
import { writeEnvLocal } from "./env-writer.js";
import {
  normalizeConfigFormInput,
  validateConfigFormInput,
  type LocalConfigFormInput,
} from "./config-local-editor.js";
import {
  collectEnvInputSecrets,
  redactKnownSecretValues,
  sanitizeSetupActionResult,
} from "./redact-secrets.js";
import type { SetupActionResult } from "./setup-actions.js";
import {
  resolveLocalFilePaths,
  type SetupEnvInput,
} from "./setup-state.js";

export interface LocalEnvFormInput {
  harnessConfigPath?: string;
  linearApiKey?: string;
  cursorApiKey?: string;
  githubToken?: string;
}

export interface LocalSetupFormPayload {
  env: LocalEnvFormInput;
  config: LocalConfigFormInput;
}

export interface LocalFileWritePlan {
  envExists: boolean;
  configExists: boolean;
  envAction: "create" | "update";
  configAction: "create" | "update";
}

export interface LocalSetupPreviewResult {
  fingerprint: string;
  plan: LocalFileWritePlan;
  envPreview: string;
  configPreview: string;
  envKeyPresence: ReturnType<typeof summarizeManagedKeyPresence>;
  envResult: SetupActionResult;
  configResult: SetupActionResult;
  validationError?: string;
}

export interface LocalSetupApplyResult {
  envResult: SetupActionResult;
  configResult: SetupActionResult;
  plan: LocalFileWritePlan;
}

export interface LocalSetupApplyOptions {
  cwd?: string;
  payload: LocalSetupFormPayload;
  confirmed: boolean;
  fingerprint: string;
}

const LOCAL_FILE_WRITE_SCOPE = SETUP_PERMISSIONS.localFileWrite.scope;

function toSetupEnvInput(form: LocalEnvFormInput): SetupEnvInput {
  return {
    harnessConfigPath: form.harnessConfigPath,
    linearApiKey: form.linearApiKey,
    cursorApiKey: form.cursorApiKey,
    githubToken: form.githubToken,
  };
}

export function normalizeLocalSetupPayload(
  payload: LocalSetupFormPayload,
): {
  envInput: SetupEnvInput;
  configInput: ReturnType<typeof normalizeConfigFormInput>;
} {
  return {
    envInput: toSetupEnvInput(payload.env),
    configInput: normalizeConfigFormInput(payload.config),
  };
}

export function computeLocalSetupFingerprint(
  payload: LocalSetupFormPayload,
  cwd?: string,
): string {
  const normalized = {
    cwd: cwd ?? process.cwd(),
    env: {
      harnessConfigPath: payload.env.harnessConfigPath?.trim() ?? "",
      linearApiKey: payload.env.linearApiKey?.trim() ?? "",
      cursorApiKey: payload.env.cursorApiKey?.trim() ?? "",
      githubToken: payload.env.githubToken?.trim() ?? "",
      preserveLinear: !payload.env.linearApiKey?.trim(),
      preserveCursor: !payload.env.cursorApiKey?.trim(),
      preserveGithub: !payload.env.githubToken?.trim(),
    },
    config: normalizeConfigFormInput(payload.config),
  };
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

function sanitizeErrorMessage(
  message: string,
  secrets: readonly string[],
): string {
  return redactKnownSecretValues(message, secrets);
}

async function buildWritePlan(paths: ReturnType<typeof resolveLocalFilePaths>): Promise<LocalFileWritePlan> {
  const existingEnv = await readExistingEnvFile(paths);
  const { access } = await import("node:fs/promises");
  let configExists = false;
  try {
    await access(paths.configLocal);
    configExists = true;
  } catch {
    configExists = false;
  }

  return {
    envExists: Boolean(existingEnv),
    configExists,
    envAction: existingEnv ? "update" : "create",
    configAction: configExists ? "update" : "create",
  };
}

export async function previewLocalSetupFiles(options: {
  cwd?: string;
  payload: LocalSetupFormPayload;
}): Promise<LocalSetupPreviewResult> {
  const paths = resolveLocalFilePaths(options.cwd);
  const existingEnv = await readExistingEnvFile(paths);
  const envInput = toSetupEnvInput(options.payload.env);
  const mergedEnv = mergeEnvInput(existingEnv, envInput);
  const envContent = generateMergedEnvContent(mergedEnv);
  const knownSecrets = [
    ...collectMergedSecrets(mergedEnv),
    ...collectEnvInputSecrets(envInput),
  ];

  let configPreview = "";
  let validationError: string | undefined;
  let configResult: SetupActionResult;

  try {
    const validated = validateConfigFormInput(options.payload.config);
    configPreview = validated.json;
    configResult = await writeConfigLocal({
      paths,
      mode: "dry-run",
      content: configPreview,
      force: true,
    });
  } catch (error) {
    validationError =
      error instanceof Error ? error.message : String(error);
    configPreview = "";
    configResult = {
      actionId: "write-config-local",
      outcome: "preview",
      targetPath: paths.configLocal,
      permission: SETUP_PERMISSIONS.localFileWrite,
      reason: sanitizeErrorMessage(validationError, knownSecrets),
    };
  }

  const envResult = sanitizeSetupActionResult(
    {
      actionId: "write-env-local",
      outcome: "preview",
      targetPath: paths.envLocal,
      content: envContent,
      permission: SETUP_PERMISSIONS.localFileWrite,
      reason: existingEnv ? "would update merged env" : "would create env",
    },
    knownSecrets,
  );

  const plan = await buildWritePlan(paths);
  const fingerprint = computeLocalSetupFingerprint(
    options.payload,
    options.cwd,
  );

  return {
    fingerprint,
    plan,
    envPreview: redactEnvContent(envContent),
    configPreview,
    envKeyPresence: summarizeManagedKeyPresence(mergedEnv),
    envResult,
    configResult: sanitizeSetupActionResult(configResult, knownSecrets),
    validationError: validationError
      ? sanitizeErrorMessage(validationError, knownSecrets)
      : undefined,
  };
}

export async function applyLocalSetupFiles(
  options: LocalSetupApplyOptions,
): Promise<LocalSetupApplyResult> {
  if (!options.confirmed) {
    throw new Error("Local file writes require explicit confirmation");
  }

  const paths = resolveLocalFilePaths(options.cwd);
  const expectedFingerprint = computeLocalSetupFingerprint(
    options.payload,
    options.cwd,
  );

  if (options.fingerprint !== expectedFingerprint) {
    throw new Error(
      "Preview fingerprint is stale. Regenerate preview before applying.",
    );
  }

  const preview = await previewLocalSetupFiles({
    cwd: options.cwd,
    payload: options.payload,
  });

  if (preview.validationError) {
    throw new Error(preview.validationError);
  }

  if (
    preview.envResult.permission.scope !== LOCAL_FILE_WRITE_SCOPE ||
    preview.configResult.permission.scope !== LOCAL_FILE_WRITE_SCOPE
  ) {
    throw new Error("Only local-file-write actions are allowed in Milestone 4");
  }

  const existingEnv = await readExistingEnvFile(paths);
  const mergedEnv = mergeEnvInput(
    existingEnv,
    toSetupEnvInput(options.payload.env),
  );
  const envContent = generateMergedEnvContent(mergedEnv);
  const knownSecrets = collectMergedSecrets(mergedEnv);

  await mkdir(paths.harnessDir, { recursive: true });

  const envResult = sanitizeSetupActionResult(
    await writeEnvLocal({
      paths,
      mode: "apply",
      content: envContent,
      force: true,
    }),
    knownSecrets,
  );

  const configResult = sanitizeSetupActionResult(
    await writeConfigLocal({
      paths,
      mode: "apply",
      content: preview.configPreview,
      force: true,
    }),
    knownSecrets,
  );

  const plan = await buildWritePlan(paths);

  return {
    envResult,
    configResult,
    plan,
  };
}
