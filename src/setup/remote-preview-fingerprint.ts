import { createHash } from "node:crypto";
import type { HarnessSecretWritePlanEntry } from "./remote-actions.js";
import type { SetupPermissionScope } from "./permission-model.js";

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function secretChangeToken(value: string): string {
  if (!value) {
    return "";
  }
  let checksum = 0;
  for (let index = 0; index < value.length; index += 1) {
    checksum = (checksum + value.charCodeAt(index)) % 1_000_000_007;
  }
  return `${value.length}:${checksum}`;
}

export interface HarnessSecretFingerprintInput {
  actionId: string;
  permissionScope: SetupPermissionScope;
  harnessDispatchRepo: string;
  harnessDispatchRepoSource: string;
  secretWritePlan: HarnessSecretWritePlanEntry[];
  linearApiKeyToken?: string;
  cursorApiKeyToken?: string;
  harnessGithubTokenToken?: string;
  configLocalHash?: string;
}

export interface TargetWorkflowFingerprintInput {
  actionId: string;
  permissionScope: SetupPermissionScope;
  repoConfigId: string;
  targetRepoSlug: string;
  harnessDispatchRepo: string;
  productionBranch: string;
  workflowPath: string;
  branchName: string;
  workflowContentHash: string;
  productionBranchSha?: string;
}

export function computeHarnessSecretFingerprint(
  input: HarnessSecretFingerprintInput,
): string {
  const normalized = {
    actionId: input.actionId,
    permissionScope: input.permissionScope,
    harnessDispatchRepo: input.harnessDispatchRepo,
    harnessDispatchRepoSource: input.harnessDispatchRepoSource,
    secretWritePlan: input.secretWritePlan.map((entry) => ({
      name: entry.name,
      action: entry.action,
      source: entry.source,
    })),
    linearApiKeyToken: input.linearApiKeyToken ?? "",
    cursorApiKeyToken: input.cursorApiKeyToken ?? "",
    harnessGithubTokenToken: input.harnessGithubTokenToken ?? "",
    configLocalHash: input.configLocalHash ?? "",
  };
  return hashValue(JSON.stringify(normalized));
}

export function computeTargetWorkflowFingerprint(
  input: TargetWorkflowFingerprintInput,
): string {
  const normalized = {
    actionId: input.actionId,
    permissionScope: input.permissionScope,
    repoConfigId: input.repoConfigId,
    targetRepoSlug: input.targetRepoSlug,
    harnessDispatchRepo: input.harnessDispatchRepo,
    productionBranch: input.productionBranch,
    workflowPath: input.workflowPath,
    branchName: input.branchName,
    workflowContentHash: input.workflowContentHash,
    productionBranchSha: input.productionBranchSha ?? "",
  };
  return hashValue(JSON.stringify(normalized));
}

export function tokenizeSecretInput(value?: string): string {
  return secretChangeToken(value?.trim() ?? "");
}
