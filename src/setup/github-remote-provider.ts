import type {
  HarnessActionsSecretName,
  HarnessSecretStatusEntry,
  RemoteAccessStatus,
  RemoteWorkflowStatus,
} from "./remote-actions.js";
import { HARNESS_ACTIONS_SECRET_NAMES } from "./remote-actions.js";

export interface HarnessSecretWriteRequest {
  name: HarnessActionsSecretName;
  value: string;
}

export interface HarnessSecretWriteResultEntry {
  name: HarnessActionsSecretName;
  status: "created" | "updated";
}

export interface TargetWorkflowApplyInput {
  targetRepoSlug: string;
  productionBranch: string;
  branchName: string;
  workflowPath: string;
  workflowContent: string;
  prTitle: string;
  prBody: string;
}

export type TargetWorkflowApplyOutcome =
  | "already-installed"
  | "pr-created"
  | "pr-updated"
  | "branch-updated";

export interface TargetWorkflowApplyResult {
  outcome: TargetWorkflowApplyOutcome;
  branchName: string;
  prUrl?: string;
  directProductionBranchWrite: false;
}

export interface GitHubRemoteSetupProvider {
  checkHarnessRepoAccess(harnessDispatchRepo: string): Promise<RemoteAccessStatus>;
  listHarnessSecretStatuses(
    harnessDispatchRepo: string,
  ): Promise<HarnessSecretStatusEntry[]>;
  checkTargetWorkflowStatus(input: {
    targetRepoSlug: string;
    workflowPath: string;
    intendedWorkflowContent: string;
    productionBranch: string;
  }): Promise<{
    repoAccess: RemoteAccessStatus;
    workflowStatus: RemoteWorkflowStatus;
    productionBranchSha?: string;
  }>;
  writeHarnessSecrets(
    harnessDispatchRepo: string,
    secrets: HarnessSecretWriteRequest[],
  ): Promise<HarnessSecretWriteResultEntry[]>;
  applyTargetWorkflowPr(
    input: TargetWorkflowApplyInput,
  ): Promise<TargetWorkflowApplyResult>;
}

export interface MockGitHubRemoteSetupProviderState {
  harnessRepoAccess?: RemoteAccessStatus;
  harnessSecretStatuses?: Partial<
    Record<HarnessActionsSecretName, HarnessSecretStatusEntry["status"]>
  >;
  targetRepoAccess?: RemoteAccessStatus;
  existingWorkflowContent?: string | null;
  productionBranchSha?: string;
  existingOpenPrUrl?: string;
  writeHarnessSecretsResult?: HarnessSecretWriteResultEntry[];
  applyTargetWorkflowResult?: TargetWorkflowApplyResult;
}

export class MockGitHubRemoteSetupProvider implements GitHubRemoteSetupProvider {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  readonly encryptedWrites: Array<{
    harnessDispatchRepo: string;
    secretName: string;
    encryptedValue: string;
  }> = [];

  constructor(private readonly state: MockGitHubRemoteSetupProviderState = {}) {}

  async checkHarnessRepoAccess(
    harnessDispatchRepo: string,
  ): Promise<RemoteAccessStatus> {
    this.calls.push({
      method: "checkHarnessRepoAccess",
      args: [harnessDispatchRepo],
    });
    return this.state.harnessRepoAccess ?? "unknown";
  }

  async listHarnessSecretStatuses(
    harnessDispatchRepo: string,
  ): Promise<HarnessSecretStatusEntry[]> {
    this.calls.push({
      method: "listHarnessSecretStatuses",
      args: [harnessDispatchRepo],
    });

    return HARNESS_ACTIONS_SECRET_NAMES.map((name) => ({
      name,
      status: this.state.harnessSecretStatuses?.[name] ?? "unknown",
    }));
  }

  async checkTargetWorkflowStatus(input: {
    targetRepoSlug: string;
    workflowPath: string;
    intendedWorkflowContent: string;
    productionBranch: string;
  }): Promise<{
    repoAccess: RemoteAccessStatus;
    workflowStatus: RemoteWorkflowStatus;
    productionBranchSha?: string;
  }> {
    this.calls.push({
      method: "checkTargetWorkflowStatus",
      args: [input],
    });

    const existing = this.state.existingWorkflowContent;
    let workflowStatus: RemoteWorkflowStatus = "unknown";
    if (existing === null || existing === undefined) {
      workflowStatus = "missing";
    } else if (existing === input.intendedWorkflowContent) {
      workflowStatus = "present";
    } else {
      workflowStatus = "differs";
    }

    return {
      repoAccess: this.state.targetRepoAccess ?? "unknown",
      workflowStatus,
      productionBranchSha: this.state.productionBranchSha,
    };
  }

  async writeHarnessSecrets(
    harnessDispatchRepo: string,
    secrets: HarnessSecretWriteRequest[],
  ): Promise<HarnessSecretWriteResultEntry[]> {
    this.calls.push({
      method: "writeHarnessSecrets",
      args: [harnessDispatchRepo, secrets.map((entry) => entry.name)],
    });

    for (const secret of secrets) {
      this.encryptedWrites.push({
        harnessDispatchRepo,
        secretName: secret.name,
        encryptedValue: `encrypted:${secret.value.length}`,
      });
    }

    return (
      this.state.writeHarnessSecretsResult ??
      secrets.map((secret) => ({
        name: secret.name,
        status:
          this.state.harnessSecretStatuses?.[secret.name] === "present"
            ? "updated"
            : "created",
      }))
    );
  }

  async applyTargetWorkflowPr(
    input: TargetWorkflowApplyInput,
  ): Promise<TargetWorkflowApplyResult> {
    this.calls.push({
      method: "applyTargetWorkflowPr",
      args: [
        {
          ...input,
          workflowContent: `<redacted:${input.workflowContent.length}>`,
        },
      ],
    });

    if (input.branchName === input.productionBranch) {
      throw new Error("Direct production branch writes are not allowed");
    }

    if (this.state.applyTargetWorkflowResult) {
      return this.state.applyTargetWorkflowResult;
    }

    if (this.state.existingWorkflowContent === input.workflowContent) {
      return {
        outcome: "already-installed",
        branchName: input.branchName,
        directProductionBranchWrite: false,
      };
    }

    return {
      outcome: this.state.existingOpenPrUrl ? "pr-updated" : "pr-created",
      branchName: input.branchName,
      prUrl:
        this.state.existingOpenPrUrl ??
        `https://github.com/${input.targetRepoSlug}/pull/1`,
      directProductionBranchWrite: false,
    };
  }
}

export function mapGitHubSecretMetadataToStatus(
  secretNames: readonly string[],
  knownSecretNames: readonly HarnessActionsSecretName[],
): HarnessSecretStatusEntry[] {
  const known = new Set(secretNames);
  return knownSecretNames.map((name) => ({
    name,
    status: known.has(name) ? "present" : "missing",
  }));
}

export function mapGitHubAccessErrorToStatus(statusCode: number): RemoteAccessStatus {
  if (statusCode === 401 || statusCode === 403) {
    return "denied";
  }
  if (statusCode === 404) {
    return "denied";
  }
  return "unknown";
}
