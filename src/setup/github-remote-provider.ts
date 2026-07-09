import type {
  HarnessActionsSecretName,
  HarnessSecretStatusEntry,
  RemoteAccessStatus,
  RemoteWorkflowStatus,
} from "./remote-actions.js";
import { HARNESS_ACTIONS_SECRET_NAMES } from "./remote-actions.js";

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
}

export interface MockGitHubRemoteSetupProviderState {
  harnessRepoAccess?: RemoteAccessStatus;
  harnessSecretStatuses?: Partial<
    Record<HarnessActionsSecretName, HarnessSecretStatusEntry["status"]>
  >;
  targetRepoAccess?: RemoteAccessStatus;
  existingWorkflowContent?: string | null;
  productionBranchSha?: string;
}

export class MockGitHubRemoteSetupProvider implements GitHubRemoteSetupProvider {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

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
