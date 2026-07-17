import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { harnessConfigSchema, type HarnessConfig } from "../config/schema.js";
import type { RepoMapping } from "../config/schema.js";
import { normalizeTargetRepoFormInput } from "./config-local-editor.js";
import type { TargetRepoFormInput } from "./config-local-editor.js";
import { readValidatedConfigLocalBytes } from "./harness-secret-setup.js";
import { resolveLocalFilePaths } from "./setup-state.js";

export type AutomationSettingsPatch = {
  planningTimeoutSeconds?: number;
  implementationTimeoutSeconds?: number;
  implementationBranchPrefix?: string;
  handoffAllowPmReviewWithoutPreview?: boolean;
  handoffPreviewRequiredForSuccess?: boolean;
  revisionTimeoutSeconds?: number;
  mergeMethod?: "squash" | "merge" | "rebase";
  mergeDeleteBranchAfterMerge?: boolean;
  mergeDeploymentRequiredForSuccess?: boolean;
  watchPollIntervalSeconds?: number;
  watchMaxConcurrentRuns?: number;
  previewPollTimeoutSeconds?: number;
  previewPollIntervalSeconds?: number;
};

export type SettingsConfigPatch =
  | {
      kind: "repos";
      repos: TargetRepoFormInput[];
    }
  | {
      kind: "automation";
      automation: AutomationSettingsPatch;
    };

export class SettingsConfigPatchError extends Error {
  constructor(
    public readonly code:
      | "settings_config_fingerprint_mismatch"
      | "settings_config_validation_failed"
      | "settings_config_write_failed",
    message: string,
  ) {
    super(message);
    this.name = "SettingsConfigPatchError";
  }
}

function reposFromFormInput(repos: TargetRepoFormInput[]): RepoMapping[] {
  return repos.map((repo) => {
    const normalized = normalizeTargetRepoFormInput(repo);
    return {
      id: normalized.id,
      targetRepo: normalized.targetRepo as RepoMapping["targetRepo"],
      baseBranch: normalized.baseBranch ?? "main",
      productionBranch: normalized.productionBranch ?? "main",
      ...(normalized.linearProjects
        ? { linearProjects: normalized.linearProjects }
        : {}),
      ...(normalized.linearTeams ? { linearTeams: normalized.linearTeams } : {}),
      ...(normalized.previewProvider
        ? { previewProvider: normalized.previewProvider }
        : {}),
      ...(normalized.integrationPreviewUrl
        ? { integrationPreviewUrl: normalized.integrationPreviewUrl }
        : {}),
      ...(normalized.productionUrl
        ? { productionUrl: normalized.productionUrl }
        : {}),
      ...(normalized.integrationSuccessStatus
        ? { integrationSuccessStatus: normalized.integrationSuccessStatus }
        : {}),
      ...(normalized.productionSuccessStatus
        ? { productionSuccessStatus: normalized.productionSuccessStatus }
        : {}),
      ...(normalized.validationCommands
        ? { validation: { commands: normalized.validationCommands } }
        : {}),
    };
  });
}

export function applySettingsConfigPatch(
  config: HarnessConfig,
  patch: SettingsConfigPatch,
): HarnessConfig {
  if (patch.kind === "repos") {
    if (patch.repos.length === 0) {
      throw new SettingsConfigPatchError(
        "settings_config_validation_failed",
        "At least one target repository must remain configured.",
      );
    }
    const repos = reposFromFormInput(patch.repos);
    return harnessConfigSchema.parse({
      ...config,
      repos,
      allowedTargetRepos: [...new Set(repos.map((repo) => repo.targetRepo))],
    });
  }

  const automation = patch.automation;
  return harnessConfigSchema.parse({
    ...config,
    planning: {
      ...config.planning,
      ...(automation.planningTimeoutSeconds !== undefined
        ? { timeoutSeconds: automation.planningTimeoutSeconds }
        : {}),
    },
    implementation: {
      ...config.implementation,
      ...(automation.implementationTimeoutSeconds !== undefined
        ? { timeoutSeconds: automation.implementationTimeoutSeconds }
        : {}),
      ...(automation.implementationBranchPrefix !== undefined
        ? { branchPrefix: automation.implementationBranchPrefix }
        : {}),
    },
    handoff: {
      ...config.handoff,
      ...(automation.handoffAllowPmReviewWithoutPreview !== undefined
        ? { allowPmReviewWithoutPreview: automation.handoffAllowPmReviewWithoutPreview }
        : {}),
      ...(automation.handoffPreviewRequiredForSuccess !== undefined
        ? { previewRequiredForSuccess: automation.handoffPreviewRequiredForSuccess }
        : {}),
    },
    revision: {
      ...config.revision,
      ...(automation.revisionTimeoutSeconds !== undefined
        ? { timeoutSeconds: automation.revisionTimeoutSeconds }
        : {}),
    },
    merge: {
      ...config.merge,
      ...(automation.mergeMethod !== undefined
        ? { mergeMethod: automation.mergeMethod }
        : {}),
      ...(automation.mergeDeleteBranchAfterMerge !== undefined
        ? { deleteBranchAfterMerge: automation.mergeDeleteBranchAfterMerge }
        : {}),
      ...(automation.mergeDeploymentRequiredForSuccess !== undefined
        ? { deploymentRequiredForSuccess: automation.mergeDeploymentRequiredForSuccess }
        : {}),
    },
    watch: {
      ...config.watch,
      ...(automation.watchPollIntervalSeconds !== undefined
        ? { pollIntervalSeconds: automation.watchPollIntervalSeconds }
        : {}),
      ...(automation.watchMaxConcurrentRuns !== undefined
        ? { maxConcurrentRuns: automation.watchMaxConcurrentRuns }
        : {}),
    },
    preview: {
      ...config.preview,
      ...(automation.previewPollTimeoutSeconds !== undefined
        ? { pollTimeoutSeconds: automation.previewPollTimeoutSeconds }
        : {}),
      ...(automation.previewPollIntervalSeconds !== undefined
        ? { pollIntervalSeconds: automation.previewPollIntervalSeconds }
        : {}),
    },
  });
}

export async function readSettingsConfigFingerprint(cwd?: string): Promise<string> {
  const { hash } = await readValidatedConfigLocalBytes(cwd);
  return hash;
}

export async function previewSettingsConfigPatch(input: {
  cwd?: string;
  patch: SettingsConfigPatch;
}): Promise<{
  fingerprint: string;
  configPreview: string;
}> {
  const { bytes, hash } = await readValidatedConfigLocalBytes(input.cwd);
  const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  const current = harnessConfigSchema.parse(parsed);
  const next = applySettingsConfigPatch(current, input.patch);
  const configPreview = `${JSON.stringify(next, null, 2)}\n`;
  return {
    fingerprint: hash,
    configPreview,
  };
}

async function writeConfigLocalAtomically(
  cwd: string | undefined,
  content: string,
): Promise<void> {
  const paths = resolveLocalFilePaths(cwd);
  await mkdir(paths.harnessDir, { recursive: true });
  const tempPath = `${paths.configLocal}.tmp-${process.pid}-${randomUUID()}`;
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  await writeFile(tempPath, normalized, "utf8");
  await rename(tempPath, paths.configLocal);
}

export async function applySettingsConfigPatchRemote(input: {
  cwd?: string;
  patch: SettingsConfigPatch;
  expectedConfigFingerprint: string;
}): Promise<{
  configFingerprint: string;
  config: HarnessConfig;
}> {
  const { bytes, hash } = await readValidatedConfigLocalBytes(input.cwd);
  if (hash !== input.expectedConfigFingerprint) {
    throw new SettingsConfigPatchError(
      "settings_config_fingerprint_mismatch",
      "Configuration changed since the page loaded. Reload and try again.",
    );
  }

  const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  const current = harnessConfigSchema.parse(parsed);
  const next = applySettingsConfigPatch(current, input.patch);
  const content = `${JSON.stringify(next, null, 2)}\n`;

  try {
    await writeConfigLocalAtomically(input.cwd, content);
  } catch {
    throw new SettingsConfigPatchError(
      "settings_config_write_failed",
      "Local harness config could not be updated.",
    );
  }

  const { hash: updatedHash } = await readValidatedConfigLocalBytes(input.cwd);
  return {
    configFingerprint: updatedHash,
    config: next,
  };
}

export function automationPatchFromConfig(
  config: HarnessConfig,
): AutomationSettingsPatch {
  return {
    planningTimeoutSeconds: config.planning?.timeoutSeconds,
    implementationTimeoutSeconds: config.implementation?.timeoutSeconds,
    implementationBranchPrefix: config.implementation?.branchPrefix,
    handoffAllowPmReviewWithoutPreview: config.handoff?.allowPmReviewWithoutPreview,
    handoffPreviewRequiredForSuccess: config.handoff?.previewRequiredForSuccess,
    revisionTimeoutSeconds: config.revision?.timeoutSeconds,
    mergeMethod: config.merge?.mergeMethod,
    mergeDeleteBranchAfterMerge: config.merge?.deleteBranchAfterMerge,
    mergeDeploymentRequiredForSuccess: config.merge?.deploymentRequiredForSuccess,
    watchPollIntervalSeconds: config.watch?.pollIntervalSeconds,
    watchMaxConcurrentRuns: config.watch?.maxConcurrentRuns,
    previewPollTimeoutSeconds: config.preview?.pollTimeoutSeconds,
    previewPollIntervalSeconds: config.preview?.pollIntervalSeconds,
  };
}
