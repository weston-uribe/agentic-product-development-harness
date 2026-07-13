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
  loadHarnessRepoProvisioningSummary,
  previewHarnessRepoProvisioning,
} from "../../src/setup/harness-repo-provisioning.js";
import {
  readHarnessProvisioningPendingState,
  writeHarnessProvisioningPendingStateAtomic,
} from "../../src/setup/harness-provisioning-pending-state.js";
import {
  MockGitHubHarnessProvisioningProvider,
} from "../../src/setup/github-remote-provider.js";
import {
  HARNESS_TEMPLATE_IDENTITY_FILE,
  parseHarnessTemplateIdentityJson,
} from "../../src/setup/harness-template-identity.js";
import * as localApplyActions from "../../src/setup/local-apply-actions.js";
import { persistGithubDispatchRepository } from "../../src/setup/local-apply-actions.js";
import { SETUP_PERMISSIONS } from "../../src/setup/permission-model.js";

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

function templateRepoMetadata() {
  return {
    owner: "weston-uribe",
    repo: "p-dev-harness-template",
    private: false,
    visibility: "public",
    isTemplate: true,
    defaultBranch: "main",
    permissions: { admin: true, maintain: true, push: true },
    templateIdentityContent: TEMPLATE_IDENTITY_JSON,
    branchHeadSha: "abc123templatehead",
  };
}

function destinationRepoMetadata(input: {
  managedMarkerContent?: string | null;
  templateIdentityContent?: string | null;
}) {
  return {
    owner: "test-user",
    repo: "p-dev-harness",
    private: true,
    visibility: "private",
    isTemplate: false,
    defaultBranch: "main",
    permissions: { admin: true, maintain: true, push: true },
    managedMarkerContent: input.managedMarkerContent ?? null,
    templateIdentityContent: input.templateIdentityContent ?? null,
    branchHeadSha: "generatedheadsha",
  };
}

function validPendingState(
  overrides: Partial<Parameters<typeof writeHarnessProvisioningPendingStateAtomic>[0]> = {},
) {
  return {
    operationId: "op-pending",
    authenticatedUserId: 1,
    authenticatedLogin: "test-user",
    targetOwner: "test-user",
    targetRepo: "p-dev-harness",
    templateOwner: "weston-uribe",
    templateRepo: "p-dev-harness-template",
    templateIdentity: "p-dev-harness-template",
    templateVersion: 1,
    compatibilityVersion: 1,
    templateContentId: "template-content-v1",
    templateDefaultBranch: "main",
    templateHeadSha: "abc123templatehead",
    previewFingerprint: "creation-fingerprint",
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("harness-repo-provisioning", () => {
  let workspaceDir = "";
  const originalRuntimeMode = process.env.P_DEV_RUNTIME_MODE;
  const originalPollTimeout = process.env.HARNESS_PROVISIONING_POLL_TIMEOUT_MS;
  const originalPollInitialDelay =
    process.env.HARNESS_PROVISIONING_POLL_INITIAL_DELAY_MS;

  beforeEach(async () => {
    process.env.P_DEV_RUNTIME_MODE = "packaged";
    delete process.env.HARNESS_PROVISIONING_POLL_TIMEOUT_MS;
    delete process.env.HARNESS_PROVISIONING_POLL_INITIAL_DELAY_MS;
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
    if (originalPollTimeout === undefined) {
      delete process.env.HARNESS_PROVISIONING_POLL_TIMEOUT_MS;
    } else {
      process.env.HARNESS_PROVISIONING_POLL_TIMEOUT_MS = originalPollTimeout;
    }
    if (originalPollInitialDelay === undefined) {
      delete process.env.HARNESS_PROVISIONING_POLL_INITIAL_DELAY_MS;
    } else {
      process.env.HARNESS_PROVISIONING_POLL_INITIAL_DELAY_MS =
        originalPollInitialDelay;
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
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
      },
    });

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      operationId: "op-pending",
    });

    await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: preview.fingerprint,
      operationId: preview.operationId,
    });

    const pending = await readHarnessProvisioningPendingState(workspaceDir);
    expect(pending).toBeNull();
  });

  it("resumes the same operation after post-create polling times out", async () => {
    process.env.HARNESS_PROVISIONING_POLL_TIMEOUT_MS = "1";
    process.env.HARNESS_PROVISIONING_POLL_INITIAL_DELAY_MS = "0";
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      deferDestinationTemplateIdentity: true,
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
      },
    });

    const firstPreview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(firstPreview.resumedFromPending).toBe(false);

    const firstApply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: firstPreview.fingerprint,
      operationId: firstPreview.operationId,
    });
    expect(firstApply.state).toBe("api-timeout-unknown");
    expect(firstApply.recoverable).toBe(true);

    const pending = await readHarnessProvisioningPendingState(workspaceDir);
    expect(pending?.operationId).toBe(firstPreview.operationId);

    provider.revealDestinationTemplateIdentity(
      "test-user/p-dev-harness",
      TEMPLATE_IDENTITY_JSON,
    );

    const resumePreview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(resumePreview.resumedFromPending).toBe(true);
    expect(resumePreview.operationId).toBe(firstPreview.operationId);
    expect(resumePreview.creationPreviewFingerprint).toBe(
      pending?.previewFingerprint,
    );

    const resumeApply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: resumePreview.fingerprint,
      operationId: resumePreview.operationId,
    });
    expect(resumeApply.state).toBe("verified-and-persisted");
    expect(
      provider.calls.filter((call) => call.method === "createRepositoryFromTemplate"),
    ).toHaveLength(1);
  });

  it("resumes marker finalization without recreating after marker write failure", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      writeRepositoryFileError: new Error("marker write failed"),
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
        "test-user/p-dev-harness": destinationRepoMetadata({
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
        }),
      },
    });

    await writeHarnessProvisioningPendingStateAtomic(
      {
        operationId: "op-marker-retry",
        authenticatedUserId: 1,
        authenticatedLogin: "test-user",
        targetOwner: "test-user",
        targetRepo: "p-dev-harness",
        templateOwner: "weston-uribe",
        templateRepo: "p-dev-harness-template",
        templateIdentity: "p-dev-harness-template",
        templateVersion: 1,
        compatibilityVersion: 1,
        templateContentId: "template-content-v1",
        templateDefaultBranch: "main",
        templateHeadSha: "abc123templatehead",
        previewFingerprint: "creation-fingerprint",
        startedAt: new Date().toISOString(),
      },
      workspaceDir,
    );

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(preview.state).toBe("same-name-template-only-with-pending");
    expect(preview.resumedFromPending).toBe(true);

    const failedApply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: preview.fingerprint,
      operationId: preview.operationId,
    });
    expect(failedApply.state).toBe("marker-write-pending");

    const retryApply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: preview.fingerprint,
      operationId: preview.operationId,
    });
    expect(retryApply.state).toBe("verified-and-persisted");
    expect(
      provider.calls.filter((call) => call.method === "createRepositoryFromTemplate"),
    ).toHaveLength(0);
  });

  it("persists locally after persistence failure without recreating or rewriting marker", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
        "test-user/p-dev-harness": destinationRepoMetadata({
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
        }),
      },
    });

    await writeHarnessProvisioningPendingStateAtomic(
      validPendingState({ operationId: "op-persist-retry" }),
      workspaceDir,
    );

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(preview.resumedFromPending).toBe(true);

    const persistSpy = vi
      .spyOn(localApplyActions, "persistGithubDispatchRepository")
      .mockImplementationOnce(async () => ({
        actionId: "write-env-local",
        outcome: "preview",
        reason: "simulated persistence failure",
        permission: SETUP_PERMISSIONS.localFileWrite,
      }));

    const failedApply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: preview.fingerprint,
      operationId: preview.operationId,
    });
    expect(failedApply.state).toBe("created-but-persistence-failed");
    expect(await readHarnessProvisioningPendingState(workspaceDir)).not.toBeNull();

    const retryPreview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    const retryApply = await applyHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
      confirmed: true,
      fingerprint: retryPreview.fingerprint,
      operationId: retryPreview.operationId,
    });
    expect(retryApply.state).toBe("verified-and-persisted");
    expect(
      provider.calls.filter((call) => call.method === "createRepositoryFromTemplate"),
    ).toHaveLength(0);
    expect(
      provider.calls.filter((call) => call.method === "writeRepositoryFile"),
    ).toHaveLength(1);
    persistSpy.mockRestore();
  });

  it("rejects pending record with wrong template HEAD SHA", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
        "test-user/p-dev-harness": destinationRepoMetadata({
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
        }),
      },
    });

    await writeHarnessProvisioningPendingStateAtomic(
      validPendingState({ templateHeadSha: "stale-template-head" }),
      workspaceDir,
    );

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(preview.state).toBe("same-name-unmanaged-collision");
  });

  it("rejects pending record with wrong template content ID", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
        "test-user/p-dev-harness": destinationRepoMetadata({
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
        }),
      },
    });

    await writeHarnessProvisioningPendingStateAtomic(
      validPendingState({ templateContentId: "wrong-content-id" }),
      workspaceDir,
    );

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(preview.state).toBe("same-name-unmanaged-collision");
  });

  it("resumes pending operation after reload without client operationId", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
        "test-user/p-dev-harness": destinationRepoMetadata({
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
        }),
      },
    });

    await writeHarnessProvisioningPendingStateAtomic(
      validPendingState({ operationId: "op-reload-resume" }),
      workspaceDir,
    );

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(preview.resumedFromPending).toBe(true);
    expect(preview.operationId).toBe("op-reload-resume");
    expect(preview.creationPreviewFingerprint).toBe("creation-fingerprint");

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

  it("rejects pending record with matching operationId but wrong user", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
      },
    });

    await writeHarnessProvisioningPendingStateAtomic(
      {
        operationId: "op-wrong-user",
        authenticatedUserId: 99,
        authenticatedLogin: "other-user",
        targetOwner: "other-user",
        targetRepo: "p-dev-harness",
        templateOwner: "weston-uribe",
        templateRepo: "p-dev-harness-template",
        templateIdentity: "p-dev-harness-template",
        templateVersion: 1,
        compatibilityVersion: 1,
        templateContentId: "template-content-v1",
        templateDefaultBranch: "main",
        templateHeadSha: "abc123templatehead",
        previewFingerprint: "creation-fingerprint",
        startedAt: new Date().toISOString(),
      },
      workspaceDir,
    );

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(preview.state).toBe("same-name-unmanaged-collision");
  });

  it("does not finalize markerless repo from a clean workspace", async () => {
    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
        "test-user/p-dev-harness": destinationRepoMetadata({
          templateIdentityContent: TEMPLATE_IDENTITY_JSON,
        }),
      },
    });

    const preview = await previewHarnessRepoProvisioning({
      cwd: workspaceDir,
      provider,
    });
    expect(preview.state).toBe("same-name-template-only-without-pending");
  });

  it("validates saved managed repo on reload summary and rejects legacy public source", async () => {
    await writeFile(
      path.join(workspaceDir, ".env.local"),
      [
        "GITHUB_TOKEN=ghp_test_token",
        "HARNESS_CONFIG_PATH=.harness/config.local.json",
        "GITHUB_DISPATCH_REPOSITORY=weston-uribe/agentic-product-development-harness",
      ].join("\n"),
      "utf8",
    );

    const provider = new MockGitHubHarnessProvisioningProvider({
      authenticatedUser: { id: 1, login: "test-user" },
      repositories: {
        "weston-uribe/p-dev-harness-template": templateRepoMetadata(),
      },
    });

    const legacySummary = await loadHarnessRepoProvisioningSummary({
      cwd: workspaceDir,
      provider,
    });
    expect(legacySummary.verifiedSavedRepo).toBe(false);
    expect(legacySummary.state).toBe("explicit-packaged-repo-legacy-source");

    const managedMarker = `${JSON.stringify(
      buildManagedMarker("test-user/p-dev-harness"),
      null,
      2,
    )}\n`;
    await writeFile(
      path.join(workspaceDir, ".env.local"),
      [
        "GITHUB_TOKEN=ghp_test_token",
        "HARNESS_CONFIG_PATH=.harness/config.local.json",
        "GITHUB_DISPATCH_REPOSITORY=test-user/p-dev-harness",
      ].join("\n"),
      "utf8",
    );
    provider.setRepository(
      "test-user/p-dev-harness",
      destinationRepoMetadata({ managedMarkerContent: managedMarker }),
    );

    const managedSummary = await loadHarnessRepoProvisioningSummary({
      cwd: workspaceDir,
      provider,
    });
    expect(managedSummary.verifiedSavedRepo).toBe(true);
    expect(managedSummary.harnessDispatchRepo).toBe("test-user/p-dev-harness");
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
