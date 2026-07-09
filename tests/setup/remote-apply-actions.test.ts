import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockGitHubRemoteSetupProvider } from "../../src/setup/github-remote-provider.js";
import {
  applyRemoteHarnessSecrets,
  applyRemoteTargetWorkflow,
  previewRemoteHarnessSecrets,
  previewRemoteTargetWorkflow,
} from "../../src/setup/remote-apply-actions.js";
import { collectRemoteSecretInputs } from "../../src/setup/redact-secrets.js";

const FAKE_SECRETS = {
  linearApiKey: "fake-linear-secret-value",
  cursorApiKey: "fake-cursor-secret-value",
  githubToken: "fake-github-secret-value",
};

describe("remote-apply-actions", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-remote-apply-"));
    const harnessDir = path.join(tempRoot, ".harness");
    await mkdir(harnessDir, { recursive: true });
    await writeFile(
      path.join(harnessDir, "config.local.json"),
      JSON.stringify(
        {
          version: 1,
          repos: [
            {
              id: "target-app",
              targetRepo: "https://github.com/owner/example-target-app",
              productionBranch: "main",
            },
          ],
          allowedTargetRepos: ["https://github.com/owner/example-target-app"],
        },
        null,
        2,
      ),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("previews harness secrets with mocked provider status and manual instructions", async () => {
    const provider = new MockGitHubRemoteSetupProvider({
      harnessRepoAccess: "available",
      harnessSecretStatuses: {
        HARNESS_CONFIG_JSON_B64: "missing",
        LINEAR_API_KEY: "present",
      },
    });

    const preview = await previewRemoteHarnessSecrets({
      cwd: tempRoot,
      operatorInput: FAKE_SECRETS,
      manualHarnessDispatchRepo: "owner/harness-repo",
      provider,
    });
    const serialized = JSON.stringify(preview);

    expect(preview.harnessDispatchRepo).toBe("owner/harness-repo");
    expect(preview.repoAccess).toBe("available");
    expect(preview.secretKeyNames.length).toBeGreaterThan(0);
    expect(preview.manualInstructions.length).toBeGreaterThan(0);
    expect(serialized).not.toContain(FAKE_SECRETS.linearApiKey);
  });

  it("previews target workflow PR plan without workflow YAML secrets", async () => {
    const provider = new MockGitHubRemoteSetupProvider({
      targetRepoAccess: "available",
      existingWorkflowContent: null,
    });

    const preview = await previewRemoteTargetWorkflow({
      cwd: tempRoot,
      repoConfigId: "target-app",
      targetRepo: "https://github.com/owner/example-target-app",
      productionBranch: "main",
      manualHarnessDispatchRepo: "owner/harness-repo",
      provider,
    });

    expect(preview.plan.harnessDispatchRepo).toBe("owner/harness-repo");
    expect(preview.plan.directProductionBranchWrite).toBe(false);
    expect(preview.workflowPreviewSummary).toContain("Install branch:");
    expect(preview.manualInstructions.join("\n")).toContain("owner/harness-repo");
  });

  it("apply rejects unconfirmed remote harness secret writes", async () => {
    const preview = await previewRemoteHarnessSecrets({
      cwd: tempRoot,
      operatorInput: FAKE_SECRETS,
      manualHarnessDispatchRepo: "owner/harness-repo",
    });

    await expect(
      applyRemoteHarnessSecrets({
        cwd: tempRoot,
        operatorInput: FAKE_SECRETS,
        manualHarnessDispatchRepo: "owner/harness-repo",
        confirmed: false,
        fingerprint: preview.fingerprint,
      }),
    ).rejects.toThrow(/confirmation/i);
  });

  it("apply rejects stale harness secret fingerprint before deferred write", async () => {
    await expect(
      applyRemoteHarnessSecrets({
        cwd: tempRoot,
        operatorInput: FAKE_SECRETS,
        manualHarnessDispatchRepo: "owner/harness-repo",
        confirmed: true,
        fingerprint: "stale-fingerprint",
      }),
    ).rejects.toThrow(/stale/i);
  });

  it("apply defers confirmed harness secret writes to PR 2", async () => {
    const preview = await previewRemoteHarnessSecrets({
      cwd: tempRoot,
      operatorInput: FAKE_SECRETS,
      manualHarnessDispatchRepo: "owner/harness-repo",
    });

    await expect(
      applyRemoteHarnessSecrets({
        cwd: tempRoot,
        operatorInput: FAKE_SECRETS,
        manualHarnessDispatchRepo: "owner/harness-repo",
        confirmed: true,
        fingerprint: preview.fingerprint,
      }),
    ).rejects.toThrow(/deferred to Milestone 5 PR 2/i);
  });

  it("apply defers confirmed target workflow writes to PR 2", async () => {
    const preview = await previewRemoteTargetWorkflow({
      cwd: tempRoot,
      repoConfigId: "target-app",
      targetRepo: "https://github.com/owner/example-target-app",
      productionBranch: "main",
      manualHarnessDispatchRepo: "owner/harness-repo",
    });

    await expect(
      applyRemoteTargetWorkflow({
        cwd: tempRoot,
        repoConfigId: "target-app",
        targetRepo: "https://github.com/owner/example-target-app",
        productionBranch: "main",
        manualHarnessDispatchRepo: "owner/harness-repo",
        confirmed: true,
        fingerprint: preview.fingerprint,
      }),
    ).rejects.toThrow(/deferred to Milestone 5 PR 2/i);

    const knownSecrets = collectRemoteSecretInputs(FAKE_SECRETS);
    expect(knownSecrets).toContain(FAKE_SECRETS.linearApiKey);
    expect(JSON.stringify(preview)).not.toContain(FAKE_SECRETS.linearApiKey);
  });
});
