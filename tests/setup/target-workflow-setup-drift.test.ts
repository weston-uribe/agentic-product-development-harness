import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MockGitHubRemoteSetupProvider } from "../../src/setup/github-remote-provider.js";
import { TARGET_WORKFLOW_PATH } from "../../src/setup/remote-actions.js";
import {
  applyRemoteTargetWorkflow,
  previewRemoteTargetWorkflow,
} from "../../src/setup/remote-apply-actions.js";
import {
  generateTargetWorkflowYaml,
  previewTargetWorkflowSetup,
} from "../../src/setup/target-workflow-setup.js";
import { workflowStatusNeedsUpgrade } from "../../src/setup/target-workflow-contract.js";

const invalidHtmlV2 = readFileSync(
  path.join(
    process.cwd(),
    "tests/fixtures/workflows/trigger-harness-production-sync-invalid-html-v2.yml",
  ),
  "utf8",
);

describe("target-workflow setup drift (HTML v2 → contract v3)", () => {
  const repoConfigId = "weston-uribe-portfolio";
  const targetRepo = "https://github.com/weston-uribe/weston-uribe-portfolio";
  const productionBranch = "main";
  const harnessDispatchRepo = {
    repo: "weston-uribe/p-dev-harness-runner",
    source: "explicit-config" as const,
    resolved: true as const,
  };

  it("reads installed HTML v2, classifies outdated, generates v3 PR, then no-ops", async () => {
    const intended = generateTargetWorkflowYaml({
      harnessDispatchRepo: harnessDispatchRepo.repo,
      repoConfigId,
      targetRepoSlug: "weston-uribe/weston-uribe-portfolio",
      productionBranch,
    });
    expect(intended).toMatch(/^# p-dev-target-workflow-contract:v3$/m);
    expect(intended).not.toContain("<!--");

    const localPreview = previewTargetWorkflowSetup({
      repoConfigId,
      targetRepo,
      productionBranch,
      harnessDispatchRepo,
      workflowStatus: "contract_outdated",
    });
    expect(localPreview.workflowContent).toBe(intended);
    expect(localPreview.plan.directProductionBranchWrite).toBe(false);
    expect(localPreview.workflowContent).toContain("HARNESS_DISPATCH_TOKEN");

    const provider = new MockGitHubRemoteSetupProvider({
      harnessRepoAccess: "available",
      targetRepoAccess: "available",
      existingWorkflowContent: invalidHtmlV2,
    });

    const remotePreview = await previewRemoteTargetWorkflow({
      repoConfigId,
      targetRepo,
      productionBranch,
      manualHarnessDispatchRepo: harnessDispatchRepo.repo,
      provider,
    });
    expect(remotePreview.plan.workflowStatus).toBe("contract_outdated");
    expect(workflowStatusNeedsUpgrade(remotePreview.plan.workflowStatus)).toBe(
      true,
    );
    expect(remotePreview.plan.workflowPath).toBe(TARGET_WORKFLOW_PATH);

    const apply = await applyRemoteTargetWorkflow({
      repoConfigId,
      targetRepo,
      productionBranch,
      manualHarnessDispatchRepo: harnessDispatchRepo.repo,
      provider,
      confirmed: true,
      fingerprint: remotePreview.fingerprint,
    });
    expect(apply.outcome).toBe("pr-created");
    expect(apply.directProductionBranchWrite).toBe(false);
    expect(apply.prUrl).toMatch(/pull\/1$/);

    const applyCall = provider.calls.find(
      (call) => call.method === "applyTargetWorkflowPr",
    );
    expect(applyCall).toBeDefined();

    // After v3 is installed on production, re-preview/apply is a no-op.
    const providerInstalled = new MockGitHubRemoteSetupProvider({
      existingWorkflowContent: intended,
      targetRepoAccess: "available",
    });
    const postPreview = await previewRemoteTargetWorkflow({
      repoConfigId,
      targetRepo,
      productionBranch,
      manualHarnessDispatchRepo: harnessDispatchRepo.repo,
      provider: providerInstalled,
    });
    expect(postPreview.plan.workflowStatus).toBe("present");
    expect(workflowStatusNeedsUpgrade(postPreview.plan.workflowStatus)).toBe(
      false,
    );

    const postApply = await applyRemoteTargetWorkflow({
      repoConfigId,
      targetRepo,
      productionBranch,
      manualHarnessDispatchRepo: harnessDispatchRepo.repo,
      provider: providerInstalled,
      confirmed: true,
      fingerprint: postPreview.fingerprint,
    });
    expect(postApply.outcome).toBe("already-installed");
  });
});
