import { createHash } from "node:crypto";
import type { HarnessSecretWritePlanEntry } from "./remote-actions.js";
import type { SetupPermissionScope } from "./permission-model.js";

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export type CredentialInputSource = "absent" | "payload" | "enriched-local";

export interface HarnessCredentialFingerprintContext {
  linearApiKey: CredentialInputSource;
  cursorApiKey: CredentialInputSource;
  harnessGithubToken: CredentialInputSource;
  explicitCredentialReplacements: string[];
  envLocalCredentialBaseline: string;
}

export interface HarnessSecretFingerprintInput {
  actionId: string;
  permissionScope: SetupPermissionScope;
  harnessDispatchRepo: string;
  harnessDispatchRepoSource: string;
  secretWritePlan: HarnessSecretWritePlanEntry[];
  credentialInputContext: HarnessCredentialFingerprintContext;
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
    credentialInputContext: {
      linearApiKey: input.credentialInputContext.linearApiKey,
      cursorApiKey: input.credentialInputContext.cursorApiKey,
      harnessGithubToken: input.credentialInputContext.harnessGithubToken,
      explicitCredentialReplacements: [
        ...input.credentialInputContext.explicitCredentialReplacements,
      ].sort(),
      envLocalCredentialBaseline:
        input.credentialInputContext.envLocalCredentialBaseline,
    },
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
