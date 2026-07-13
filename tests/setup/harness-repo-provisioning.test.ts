import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHarnessManagedRepoMarker,
  parseHarnessManagedRepoMarkerJson,
} from "../../src/setup/harness-managed-repo-marker.js";
import {
  applyHarnessRepoProvisioning,
  previewHarnessRepoProvisioning,
} from "../../src/setup/harness-repo-provisioning.js";
import {
  clearHarnessProvisioningPendingState,
  readHarnessProvisioningPendingState,
} from "../../src/setup/harness-provisioning-pending-state.js";
import {
  MockGitHubHarnessProvisioningProvider,
} from "../../src/setup/github-remote-provider.js";
import {
  HARNESS_TEMPLATE_IDENTITY_FILE,
  parseHarnessTemplateIdentityJson,
} from "../../src/setup/harness-template-identity.js";
import { persistGithubDispatchRepository } from "../../src/setup/local-apply-actions.js";

const TEMPLATE_IDENTITY = {
  schemaVersion: 1,
  product: "p-dev",
  role: "harness-template",
  templateIdentity: "p-dev-harness-template",
  templateVersion: 1,
  compatibilityVersion: 1,
  templateContentId: "template-content-v1",
  source: {
    repository: "weston-uribe/p-dev-harness-template",
    release: "v1",
  },
};

const TEMPLATE_IDENTITY_JSON = `${JSON.stringify(TEMPLATE_IDENTITY, null, 2)}\n`;

function buildManagedMarker(repoSlug: string) {
  return buildHarnessManagedRepoMarker({
    repository: repoSlug,
    templateIdentity: TEMPLATE_IDENTITY,
    defaultBranch: "main",
    sourceHeadSha: "abc123templatehead",
    operationId: "op-1",
    createdByGithubUserId: 1,
    createdByLogin: "test-user",
    pDevVersion: "0.2.0",
  });
}

describe("harness-repo-provisioning", () => {
  let workspaceDir = "";
  const originalRuntimeMode = process.env.P_DEV_RUNTIME_MODE;

  beforeEach(async () => {
    process.env.P_DEV_RUNTIME_MODE = "packaged";
    workspaceDir = await mkdtemp(path.join(tmpdir(), "harness-provision-"));
    await mkdir(path.join(workspaceDir, ".harness"), { recursive: true });
    await writeFile(
      path.join(workspaceDir, ".env.local"),
      ["GITHUB_TOKEN=ghp_test_token", "HARNESS_CONFIG_PATH=.harness/config.local.json"].join(
        "\n",
      ),
      "utf8",
    );
  });

  afterEach(async () => {
    if (originalRuntimeMode === undefined) {
      delete process.env.P_DEV_RUNTIME_MODE;
    } else {
      process.env.P_DEV_RUNTIME_MODE = originalRuntimeMode;
    }
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("skips provisioning when packaged runtime mode is not active", async () => {
    delete process.env.P_DEV_RUNTIME_MODE;
    const provider = new MockGitHubHarnessProvisioningProvider();
    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(preview.state).toBe("skipped-not-packaged");
    expect(preview.willCreateRepository).toBe(false);
  });

  it("fails fine-grained PAT before repository creation", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      tokenCapabilities: {
        login: "test-user",
        tokenType: "fine-grained",
        hasRepoScope: true,
        hasWorkflowScope: true,
        scopeAmbiguous: false,
      },
      repositories: {
        "weston-uribe/p-dev-harness-template": {
          owner: "weston-uribe",
          repo: "p-dev-harness-template",
          private: false,
          visibility: "public",
          isTemplate: true,
          defaultBranch: "main",
          permissions: { admin: true, maintain: true, push: true },
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
          branchHeadSha: "abc123templatehead",
        },
      },
    });

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      operationId: "op-fg",
    });
    expect(preview.state).toBe("token-unsupported");
    expect(provider.calls.some((call) => call.method === "createRepositoryFromTemplate")).toBe(
      false,
    );
  });

  it("provisions login/p-dev-harness for a fresh packaged workspace", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": {
          owner: "weston-uribe",
          repo: "p-dev-harness-template",
          private: false,
          visibility: "public",
          isTemplate: true,
          defaultBranch: "main",
          permissions: { admin: true, maintain: true, push: true },
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
          branchHeadSha: "abc123templatehead",
        },
      },
    });

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      operationId: "op-create",
    });
    expect(preview.state).toBe("repo-absent");
    expect(preview.willCreateRepository).toBe(true);

    const apply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: preview.fingerprint,
      operationId: preview.operationId,
    });

    expect(apply.state).toBe("verified-and-persisted");
    expect(apply.harnessDispatchRepo).toBe("test-user/p-dev-harness");
    expect(provider.calls.some((call) => call.method === "createRepositoryFromTemplate")).toBe(
      true,
    );

    const env = await readFile(path.join(workspaceDir, ".env.local"), "utf8");
    expect(env).toContain("GITHUB_DISPATCH_REPOSITORY=test-user/p-dev-harness");
    expect(JSON.stringify(provider.calls)).not.toContain("ghp_test_token");
  });

  it("reconnects an existing managed private repo without creating again", async () => {
    const managedMarker = `${JSON.stringify(
      buildManagedMarker("test-user/p-dev-harness"),
      null,
      2,
    )}\n`;
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": {
          owner: "weston-uribe",
          repo: "p-dev-harness-template",
          private: false,
          visibility: "public",
          isTemplate: true,
          defaultBranch: "main",
          permissions: { admin: true, maintain: true, push: true },
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
          branchHeadSha: "abc123templatehead",
        },
        "test-user/p-dev-harness": {
          owner: "test-user",
          repo: "p-dev-harness",
          private: true,
          visibility: "private",
          isTemplate: false,
          defaultBranch: "main",
          permissions: { admin: true, maintain: true, push: true },
          managedMarkerContent: managedMarker,
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
          branchHeadSha: "generatedheadsha",
        },
      },
    });

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      operationId: "op-reuse",
    });
    expect(preview.state).toBe("valid-existing-managed-repo");

    const apply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: preview.fingerprint,
      operationId: preview.operationId,
    });

    expect(apply.state).toBe("verified-and-persisted");
    expect(
      provider.calls.filter((call) => call.method === "createRepositoryFromTemplate"),
    ).toHaveLength(0);
  });

  it("rejects stale preview fingerprint before mutation", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": {
          owner: "weston-uribe",
          repo: "p-dev-harness-template",
          private: false,
          visibility: "public",
          isTemplate: true,
          defaultBranch: "main",
          permissions: { admin: true, maintain: true, push: true },
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
          branchHeadSha: "abc123templatehead",
        },
      },
    });

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      operationId: "op-stale",
    });

    const apply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: `${preview.fingerprint}-stale`,
      operationId: preview.operationId,
    });

    expect(apply.state).toBe("template-preview-stale");
    expect(
      provider.calls.some((call) => call.method === "createRepositoryFromTemplate"),
    ).toBe(false);
  });

  it("persists dispatch repo without leaking secrets", async () => {
    const result = await persistGithubDispatchRepository({
      cwd: workspaceDir,
      githubDispatchRepository: "test-user/p-dev-harness",
    });
    expect(result.outcome).toBe("changed");
    const env = await readFile(path.join(workspaceDir, ".env.local"), "utf8");
    expect(env).toContain("GITHUB_DISPATCH_REPOSITORY=test-user/p-dev-harness");
    expect(env).toContain("GITHUB_TOKEN=ghp_test_token");
  });

  it("writes pending state atomically before create", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": {
          owner: "weston-uribe",
          repo: "p-dev-harness-template",
          private: false,
          visibility: "public",
          isTemplate: true,
          defaultBranch: "main",
          permissions: { admin: true, maintain: true, push: true },
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
          branchHeadSha: "abc123templatehead",
        },
      },
    });

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      operationId: "op-pending",
    });

    const applyPromise = applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: preview.fingerprint,
      operationId: preview.operationId,
    });

    await applyPromise;
    const pending = await readHarnessProvisioningPendingState(workspaceDir);
    expect(pending).toBeNull();
  });
});

describe("harness template and marker contracts", () => {
  it("parses approved template identity", () => {
    const parsed = parseHarnessTemplateIdentityJson(TEMPLATE_IDENTITY_JSON);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.identity.templateContentId).toBe("template-content-v1");
    }
  });

  it("parses managed marker", () => {
    const marker = buildManagedMarker("test-user/p-dev-harness");
    const parsed = parseHarnessManagedRepoMarkerJson(JSON.stringify(marker));
    expect(parsed.ok).toBe(true);
  });
});
