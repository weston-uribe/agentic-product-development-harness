import { describe, expect, it } from "vitest";
import {
  computeHarnessSecretFingerprint,
  computeTargetWorkflowFingerprint,
  tokenizeSecretInput,
} from "../../src/setup/remote-preview-fingerprint.js";

describe("remote-preview-fingerprint", () => {
  it("changes when secret input tokens change without storing raw values", () => {
    const base = computeHarnessSecretFingerprint({
      actionId: "preview-harness-secrets",
      permissionScope: "remote-read",
      harnessDispatchRepo: "owner/harness",
      harnessDispatchRepoSource: "git-remote-origin",
      secretWritePlan: [
        {
          name: "LINEAR_API_KEY",
          action: "create",
          source: "operator-input",
        },
      ],
      linearApiKeyToken: tokenizeSecretInput("secret-a"),
    });

    const changed = computeHarnessSecretFingerprint({
      actionId: "preview-harness-secrets",
      permissionScope: "remote-read",
      harnessDispatchRepo: "owner/harness",
      harnessDispatchRepoSource: "git-remote-origin",
      secretWritePlan: [
        {
          name: "LINEAR_API_KEY",
          action: "create",
          source: "operator-input",
        },
      ],
      linearApiKeyToken: tokenizeSecretInput("secret-b"),
    });

    expect(base).not.toBe(changed);
    expect(base).not.toContain("secret-a");
    expect(changed).not.toContain("secret-b");
  });

  it("changes when workflow content hash changes", () => {
    const first = computeTargetWorkflowFingerprint({
      actionId: "preview-target-workflow-pr",
      permissionScope: "remote-read",
      repoConfigId: "target-app",
      targetRepoSlug: "owner/example-target-app",
      harnessDispatchRepo: "owner/harness",
      productionBranch: "main",
      workflowPath: ".github/workflows/trigger-harness-production-sync.yml",
      branchName: "harness/setup-production-sync-target-app",
      workflowContentHash: "hash-a",
    });

    const second = computeTargetWorkflowFingerprint({
      actionId: "preview-target-workflow-pr",
      permissionScope: "remote-read",
      repoConfigId: "target-app",
      targetRepoSlug: "owner/example-target-app",
      harnessDispatchRepo: "owner/harness",
      productionBranch: "main",
      workflowPath: ".github/workflows/trigger-harness-production-sync.yml",
      branchName: "harness/setup-production-sync-target-app",
      workflowContentHash: "hash-b",
    });

    expect(first).not.toBe(second);
  });
});
