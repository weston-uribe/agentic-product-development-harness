import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/setup/vercel-setup-plan.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/setup/vercel-setup-plan.js")>();
  return {
    ...actual,
    previewVercelBridgeSetup: vi.fn(),
  };
});

vi.mock("../../src/setup/linear-webhook-secret.js", () => ({
  ensureLinearIssueWebhook: vi.fn(),
  generateLinearWebhookSecret: vi.fn(),
  resolveLinearWebhookCandidateSecret: vi.fn(),
}));

vi.mock("../../src/setup/linear-setup-plan.js", () => ({
  summarizeLinearWebhookReadiness: vi.fn(),
}));

vi.mock("../../src/setup/vercel-setup-client.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/setup/vercel-setup-client.js")>();
  return {
    ...actual,
    listVercelTeams: vi.fn(),
    listVercelProjects: vi.fn(),
    createVercelTeam: vi.fn(),
    createVercelProject: vi.fn(),
    listVercelProjectEnvVars: vi.fn(),
    summarizeRequiredEnvPresence: vi.fn(),
    upsertVercelProjectEnvVar: vi.fn(),
  };
});

vi.mock("../../src/setup/vercel-webhook-probe.js", () => ({
  runSignedWebhookProbe: vi.fn(),
}));

vi.mock("../../src/setup/control-plane-setup-state.js", () => ({
  updateControlPlaneSetupState: vi.fn(),
  readControlPlaneSetupState: vi.fn(),
}));

vi.mock("../../src/setup/vercel-production-redeploy.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/setup/vercel-production-redeploy.js")
    >();
  return {
    ...actual,
    findLatestReadyProductionDeploymentId: vi.fn(),
    triggerProductionRedeployOnce: vi.fn(),
  };
});

import { runSignedWebhookProbe } from "../../src/setup/vercel-webhook-probe.js";
import {
  updateControlPlaneSetupState,
  readControlPlaneSetupState,
} from "../../src/setup/control-plane-setup-state.js";
import { summarizeLinearWebhookReadiness } from "../../src/setup/linear-setup-plan.js";
import {
  ensureLinearIssueWebhook,
  generateLinearWebhookSecret,
  resolveLinearWebhookCandidateSecret,
} from "../../src/setup/linear-webhook-secret.js";
import {
  listVercelProjectEnvVars,
  listVercelProjects,
  listVercelTeams,
  summarizeRequiredEnvPresence,
  upsertVercelProjectEnvVar,
} from "../../src/setup/vercel-setup-client.js";
import {
  previewVercelBridgeSetup,
  VERCEL_SETUP_ACTIONS,
} from "../../src/setup/vercel-setup-plan.js";
import { applyVercelBridgeSetup } from "../../src/setup/vercel-setup-apply.js";
import {
  findLatestReadyProductionDeploymentId,
  triggerProductionRedeployOnce,
} from "../../src/setup/vercel-production-redeploy.js";

const previewResult = {
  actionId: VERCEL_SETUP_ACTIONS.preview.id,
  teams: [],
  projects: [{ id: "proj-1", name: "harness-gui", accountId: "acct-1" }],
  selectedProject: { id: "proj-1", name: "harness-gui", accountId: "acct-1" },
  productionUrl: "https://harness-gui.vercel.app",
  webhookUrl: "https://harness-gui.vercel.app/api/linear-webhook",
  deploymentStatus: "ready" as const,
  endpointReachable: true,
  envWritePlan: [
    {
      key: "LINEAR_WEBHOOK_SECRET",
      action: "create",
      source: "generated",
    },
    {
      key: "GITHUB_DISPATCH_TOKEN",
      action: "update",
      source: "derived",
      existingType: "sensitive",
      desiredType: "sensitive",
    },
    {
      key: "HARNESS_TEAM_KEY",
      action: "create",
      source: "derived",
    },
  ],
  requiredEnvPresence: {
    LINEAR_WEBHOOK_SECRET: "missing",
    GITHUB_DISPATCH_TOKEN: "missing",
    HARNESS_TEAM_KEY: "missing",
  },
  linearWebhookVerified: false,
  readiness: {
    ready: false,
    blockers: [],
    warnings: [],
  },
  manualSteps: [],
  fingerprint: "preview-fingerprint",
  permission: VERCEL_SETUP_ACTIONS.preview.permission,
} as const;

describe("vercel-setup-apply", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "vercel-setup-apply-"));
    await mkdir(path.join(tempRoot, ".harness"), { recursive: true });

    vi.clearAllMocks();
    vi.mocked(readControlPlaneSetupState).mockResolvedValue(null);
    vi.mocked(resolveLinearWebhookCandidateSecret).mockResolvedValue({
      secret: "generated-webhook-secret",
      source: "generated",
      manualSteps: [],
    });
    vi.mocked(generateLinearWebhookSecret).mockReturnValue("generated-webhook-secret");
    vi.mocked(ensureLinearIssueWebhook).mockResolvedValue({
      mode: "automated",
      secret: "generated-webhook-secret",
      manualSteps: [],
      webhook: {
        id: "wh-1",
        url: "https://harness-gui.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
    });
    vi.mocked(previewVercelBridgeSetup).mockResolvedValue(previewResult);
    vi.mocked(listVercelTeams).mockResolvedValue([
      { id: "team-1", name: "Acme", slug: "acme" },
    ]);
    vi.mocked(listVercelProjects).mockResolvedValue([
      { id: "proj-1", name: "harness-gui", accountId: "acct-1" },
    ]);
    vi.mocked(listVercelProjectEnvVars).mockResolvedValue([
      {
        id: "env-sensitive",
        key: "GITHUB_DISPATCH_TOKEN",
        type: "sensitive",
        target: ["production"],
      },
      { id: "env-1", key: "LINEAR_WEBHOOK_SECRET", type: "sensitive" },
      { id: "env-2", key: "GITHUB_DISPATCH_TOKEN", type: "sensitive" },
      { id: "env-3", key: "HARNESS_TEAM_KEY", type: "plain" },
    ]);
    vi.mocked(summarizeRequiredEnvPresence).mockReturnValue({
      LINEAR_WEBHOOK_SECRET: "present",
      GITHUB_DISPATCH_TOKEN: "present",
      HARNESS_TEAM_KEY: "present",
    });
    vi.mocked(summarizeLinearWebhookReadiness).mockResolvedValue({
      matchingWebhook: {
        id: "wh-1",
        url: "https://harness-gui.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
      manualSteps: [],
    });
    vi.mocked(updateControlPlaneSetupState).mockResolvedValue(undefined);
    vi.mocked(upsertVercelProjectEnvVar).mockResolvedValue(undefined);
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: true,
      result: "accepted_ignored",
      reason: "ignored_event",
      probedAt: new Date().toISOString(),
      webhookHost: "harness-gui.vercel.app",
      webhookPath: "/api/linear-webhook",
    });
    vi.mocked(findLatestReadyProductionDeploymentId).mockResolvedValue(
      "dpl-source-1",
    );
    vi.mocked(triggerProductionRedeployOnce).mockResolvedValue({
      status: "triggered",
      sourceDeploymentId: "dpl-source-1",
      newDeploymentId: "dpl-new-1",
      message: "Production redeploy triggered. Waiting for Vercel deployment READY.",
    });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("requires confirmation before writing Vercel bridge env vars", async () => {
    await expect(
      applyVercelBridgeSetup({
        plan: {
          vercelToken: "vercel-token",
          projectId: "proj-1",
          linearApiKey: "lin_api_test",
          derivedHarnessTeamKey: "WES",
          derivedGithubDispatchToken: "ghp_saved",
        },
        confirmed: false,
        fingerprint: "preview-fingerprint",
        cwd: tempRoot,
      }),
    ).rejects.toThrow(/confirmation/i);
  });

  it("writes env vars after confirmation and preserves existing env var metadata", async () => {
    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(previewVercelBridgeSetup).toHaveBeenCalledTimes(2);
    expect(ensureLinearIssueWebhook).toHaveBeenCalled();
    expect(upsertVercelProjectEnvVar).toHaveBeenCalledWith(
      "vercel-token",
      expect.objectContaining({
        key: "GITHUB_DISPATCH_TOKEN",
        existingEnv: expect.objectContaining({ type: "sensitive" }),
      }),
    );
    expect(listVercelProjectEnvVars).toHaveBeenCalledTimes(2);
    expect(updateControlPlaneSetupState).toHaveBeenCalledWith(
      expect.objectContaining({
        vercel: expect.objectContaining({
          envVarPresence: {
            LINEAR_WEBHOOK_SECRET: "present",
            GITHUB_DISPATCH_TOKEN: "present",
            HARNESS_TEAM_KEY: "present",
          },
        }),
      }),
      tempRoot,
    );
    expect(result.verified).toBe(true);
    expect(result.signedProbeVerified).toBe(true);
    expect(result.status).toBe("applied");
    expect(result.project?.outcome).toBe("reused");
    expect(result.writtenEnvKeys).toEqual([
      "LINEAR_WEBHOOK_SECRET",
      "GITHUB_DISPATCH_TOKEN",
      "HARNESS_TEAM_KEY",
    ]);
    expect(JSON.stringify(result)).not.toContain("generated-webhook-secret");
    expect(JSON.stringify(result)).not.toContain("ghp_saved");
  });

  it("exposes manual-copy secret only in apply result fallback state", async () => {
    vi.mocked(ensureLinearIssueWebhook).mockResolvedValue({
      mode: "manual-copy",
      secret: "manual-copy-secret",
      manualSteps: ["Copy the generated secret into Linear."],
    });
    vi.mocked(summarizeLinearWebhookReadiness).mockResolvedValue({
      matchingWebhook: undefined,
      manualSteps: [],
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(result.linearWebhookSetup.mode).toBe("manual-copy");
    expect(result.linearWebhookSetup.manualCopySecret).toBe("manual-copy-secret");
    expect(result.verified).toBe(false);
    expect(result.signedProbeVerified).toBe(true);
    expect(result.status).toBe("applied");
  });

  it("returns deployment-required without env or Linear writes when no production URL exists", async () => {
    vi.mocked(previewVercelBridgeSetup)
      .mockResolvedValueOnce(previewResult)
      .mockResolvedValueOnce({
        ...previewResult,
        webhookUrl: undefined,
        productionUrl: undefined,
        deploymentStatus: "missing",
        deploymentRequired: {
          message:
            'Project "harness-gui" exists in Vercel but has no production deployment yet.',
          nextSteps: ["Deploy the project in Vercel before applying settings."],
        },
      });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(result.status).toBe("deployment-required");
    expect(result.deploymentRequired?.projectJustCreated).toBe(false);
    expect(ensureLinearIssueWebhook).not.toHaveBeenCalled();
    expect(upsertVercelProjectEnvVar).not.toHaveBeenCalled();
    expect(updateControlPlaneSetupState).not.toHaveBeenCalled();
    expect(result.verified).toBe(false);
    expect(result.signedProbeVerified).toBe(false);
  });

  it("does not mark existing-unverified webhook setup as verified", async () => {
    vi.mocked(ensureLinearIssueWebhook).mockResolvedValue({
      mode: "existing-unverified",
      secret: "generated-webhook-secret",
      manualSteps: ["Rotate the Linear webhook signing secret."],
      webhook: {
        id: "wh-1",
        url: "https://harness-gui.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
    });
    vi.mocked(summarizeLinearWebhookReadiness).mockResolvedValue({
      matchingWebhook: {
        id: "wh-1",
        url: "https://harness-gui.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
      manualSteps: [],
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(result.linearWebhookSetup.mode).toBe("existing-unverified");
    expect(result.verified).toBe(false);
    expect(result.signedProbeVerified).toBe(true);
  });

  it("updates existing Vercel LINEAR_WEBHOOK_SECRET and fails probe when stale value is preserved", async () => {
    vi.mocked(previewVercelBridgeSetup).mockResolvedValue({
      ...previewResult,
      envWritePlan: [
        {
          key: "LINEAR_WEBHOOK_SECRET",
          action: "skip",
          source: "preserve-existing",
        },
        {
          key: "GITHUB_DISPATCH_TOKEN",
          action: "update",
          source: "derived",
        },
        {
          key: "HARNESS_TEAM_KEY",
          action: "create",
          source: "derived",
        },
      ],
    });
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: false,
      result: "auth_failed",
      reason: "invalid_signature",
      probedAt: new Date().toISOString(),
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(upsertVercelProjectEnvVar).toHaveBeenCalledWith(
      "vercel-token",
      expect.objectContaining({
        key: "LINEAR_WEBHOOK_SECRET",
        value: "generated-webhook-secret",
      }),
    );
    expect(result.signedProbeVerified).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.productionRedeployTriggered).toBe(true);
    expect(triggerProductionRedeployOnce).toHaveBeenCalledTimes(1);
    expect(result.setupPending).toBe(true);
    expect(result.pollActionId).toBeTruthy();
    expect(result.productionRedeployStatus).toBe("triggered");
  });

  it("does not allow manualComplete to override a failed signed probe", async () => {
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: false,
      result: "auth_failed",
      reason: "invalid_signature",
      probedAt: new Date().toISOString(),
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      manualComplete: true,
      cwd: tempRoot,
    });

    expect(result.verified).toBe(false);
    expect(result.signedProbeVerified).toBe(false);
  });

  it("returns pending redeploy state quickly when stale signature probe requires auto-redeploy", async () => {
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: false,
      result: "auth_failed",
      reason: "invalid_signature",
      probedAt: new Date().toISOString(),
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(result.writtenEnvKeys).toContain("LINEAR_WEBHOOK_SECRET");
    expect(triggerProductionRedeployOnce).toHaveBeenCalledTimes(1);
    expect(result.productionRedeployTriggered).toBe(true);
    expect(result.productionRedeployStatus).toBe("triggered");
    expect(result.setupPending).toBe(true);
    expect(result.pollActionId).toMatch(/^vercel-redeploy-/);
    expect(result.signedProbeVerified).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.candidateSecretSource).toBe("generated");
    expect(result.signedProbeInitialResult?.reason).toBe("invalid_signature");
    expect(result.setupBlocked).toBeUndefined();
    expect(updateControlPlaneSetupState).toHaveBeenCalledWith(
      expect.objectContaining({
        vercel: expect.objectContaining({
          redeployVerification: expect.objectContaining({
            newDeploymentId: "dpl-new-1",
            sourceDeploymentId: "dpl-source-1",
            verifyAttempted: false,
            fingerprint: "preview-fingerprint",
          }),
        }),
      }),
      tempRoot,
    );
    expect(JSON.stringify(result)).not.toContain("generated-webhook-secret");
    expect(JSON.stringify(result)).not.toContain("ghp_saved");
  });

  it("upserts reused-readable LINEAR_WEBHOOK_SECRET even when Vercel already has the env var", async () => {
    vi.mocked(resolveLinearWebhookCandidateSecret).mockResolvedValue({
      secret: "stable-webhook-secret",
      source: "reused-readable",
      manualSteps: [],
    });
    vi.mocked(previewVercelBridgeSetup).mockResolvedValue({
      ...previewResult,
      envWritePlan: [
        {
          key: "LINEAR_WEBHOOK_SECRET",
          action: "skip",
          source: "preserve-existing",
        },
        {
          key: "GITHUB_DISPATCH_TOKEN",
          action: "update",
          source: "derived",
        },
        {
          key: "HARNESS_TEAM_KEY",
          action: "create",
          source: "derived",
        },
      ],
    });
    vi.mocked(listVercelProjectEnvVars).mockReset();
    vi.mocked(listVercelProjectEnvVars).mockResolvedValue([
      { id: "env-1", key: "LINEAR_WEBHOOK_SECRET", type: "sensitive" },
      { id: "env-2", key: "GITHUB_DISPATCH_TOKEN", type: "sensitive" },
      { id: "env-3", key: "HARNESS_TEAM_KEY", type: "plain" },
    ]);
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: false,
      result: "auth_failed",
      reason: "invalid_signature",
      probedAt: new Date().toISOString(),
    });
    vi.mocked(ensureLinearIssueWebhook).mockResolvedValue({
      mode: "automated",
      secret: "stable-webhook-secret",
      manualSteps: [],
      webhook: {
        id: "wh-1",
        url: "https://harness-gui.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(upsertVercelProjectEnvVar).toHaveBeenCalledWith(
      "vercel-token",
      expect.objectContaining({
        key: "LINEAR_WEBHOOK_SECRET",
        value: "stable-webhook-secret",
      }),
    );
    expect(result.writtenEnvKeys).toContain("LINEAR_WEBHOOK_SECRET");
    expect(result.candidateSecretSource).toBe("reused-readable");
    expect(result.signedProbeVerified).toBe(false);
    expect(result.productionRedeployTriggered).toBe(true);
    expect(JSON.stringify(result)).not.toContain("stable-webhook-secret");
  });

  it("reuses the same webhook secret on verification retry without rewriting Vercel or rotating Linear", async () => {
    vi.mocked(readControlPlaneSetupState).mockResolvedValue({
      version: 1,
      vercel: {
        projectId: "proj-1",
        projectName: "harness-gui",
        productionUrl: "https://harness-gui.vercel.app",
        webhookUrl: "https://harness-gui.vercel.app/api/linear-webhook",
        endpointReachable: true,
        envVarPresence: {
          LINEAR_WEBHOOK_SECRET: "present",
          GITHUB_DISPATCH_TOKEN: "present",
          HARNESS_TEAM_KEY: "present",
        },
        linearWebhookVerified: true,
        deploymentRedeployRequired: true,
        appliedFingerprint: "preview-fingerprint",
      },
    });
    vi.mocked(resolveLinearWebhookCandidateSecret).mockResolvedValue({
      secret: "stable-webhook-secret",
      source: "reused-readable",
      manualSteps: [],
    });
    vi.mocked(listVercelProjectEnvVars).mockResolvedValue([
      { id: "env-1", key: "LINEAR_WEBHOOK_SECRET", type: "sensitive" },
      { id: "env-2", key: "GITHUB_DISPATCH_TOKEN", type: "sensitive" },
      { id: "env-3", key: "HARNESS_TEAM_KEY", type: "plain" },
    ]);
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: true,
      result: "accepted_ignored",
      reason: "ignored_event",
      probedAt: new Date().toISOString(),
      webhookHost: "harness-gui.vercel.app",
      webhookPath: "/api/linear-webhook",
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      verifyOnly: true,
      cwd: tempRoot,
    });

    expect(generateLinearWebhookSecret).not.toHaveBeenCalled();
    expect(ensureLinearIssueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: "stable-webhook-secret",
        mutatePolicy: "verify-only",
      }),
    );
    expect(upsertVercelProjectEnvVar).not.toHaveBeenCalledWith(
      "vercel-token",
      expect.objectContaining({ key: "LINEAR_WEBHOOK_SECRET" }),
    );
    expect(result.writtenEnvKeys).not.toContain("LINEAR_WEBHOOK_SECRET");
    expect(result.verificationRetry).toBe(true);
    expect(result.candidateSecretSource).toBe("reused-readable");
    expect(result.deploymentRedeployRequired).toBe(false);
    expect(result.verified).toBe(true);
    expect(result.signedProbeVerified).toBe(true);
  });

  it("does not trigger another redeploy when pending state already has newDeploymentId", async () => {
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: false,
      result: "auth_failed",
      reason: "invalid_signature",
      probedAt: new Date().toISOString(),
    });
    vi.mocked(readControlPlaneSetupState).mockResolvedValue({
      version: 1,
      vercel: {
        projectId: "proj-1",
        projectName: "harness-gui",
        productionUrl: "https://harness-gui.vercel.app",
        webhookUrl: "https://harness-gui.vercel.app/api/linear-webhook",
        endpointReachable: true,
        envVarPresence: {
          LINEAR_WEBHOOK_SECRET: "present",
          GITHUB_DISPATCH_TOKEN: "present",
          HARNESS_TEAM_KEY: "present",
        },
        linearWebhookVerified: true,
        deploymentRedeployRequired: true,
        appliedFingerprint: "preview-fingerprint",
        redeployVerification: {
          actionId: "vercel-redeploy-existing",
          projectId: "proj-1",
          projectName: "harness-gui",
          webhookUrl: "https://harness-gui.vercel.app/api/linear-webhook",
          fingerprint: "preview-fingerprint",
          sourceDeploymentId: "dpl-source-1",
          newDeploymentId: "dpl-new-1",
          status: "building",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deadlineAt: new Date(Date.now() + 300_000).toISOString(),
          verifyAttempted: false,
        },
      },
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(triggerProductionRedeployOnce).not.toHaveBeenCalled();
    expect(result.setupPending).toBe(true);
    expect(result.pollActionId).toBe("vercel-redeploy-existing");
    expect(result.productionRedeployStatus).toBe("building");
  });

  it("attempts one setup rotation when matching Linear webhook secret is unreadable", async () => {
    vi.mocked(resolveLinearWebhookCandidateSecret).mockResolvedValue({
      source: "unreadable",
      manualSteps: ["Secret unreadable."],
      matchingWebhook: {
        id: "wh-1",
        url: "https://harness-gui.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
    });
    vi.mocked(generateLinearWebhookSecret).mockReturnValue("generated-webhook-secret");

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(ensureLinearIssueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: "generated-webhook-secret",
        mutatePolicy: "setup",
      }),
    );
    expect(result.candidateSecretSource).toBe("unreadable");
  });

  it("blocks repeated rotation when unreadable secret verification is retried", async () => {
    vi.mocked(readControlPlaneSetupState).mockResolvedValue({
      version: 1,
      vercel: {
        projectId: "proj-1",
        projectName: "harness-gui",
        productionUrl: "https://harness-gui.vercel.app",
        webhookUrl: "https://harness-gui.vercel.app/api/linear-webhook",
        endpointReachable: true,
        envVarPresence: {
          LINEAR_WEBHOOK_SECRET: "present",
          GITHUB_DISPATCH_TOKEN: "present",
          HARNESS_TEAM_KEY: "present",
        },
        linearWebhookVerified: false,
        deploymentRedeployRequired: true,
        appliedFingerprint: "preview-fingerprint",
      },
    });
    vi.mocked(resolveLinearWebhookCandidateSecret).mockResolvedValue({
      source: "unreadable",
      manualSteps: ["Secret unreadable."],
      matchingWebhook: {
        id: "wh-1",
        url: "https://harness-gui.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      verifyOnly: true,
      cwd: tempRoot,
    });

    expect(ensureLinearIssueWebhook).not.toHaveBeenCalled();
    expect(upsertVercelProjectEnvVar).not.toHaveBeenCalledWith(
      "vercel-token",
      expect.objectContaining({ key: "LINEAR_WEBHOOK_SECRET" }),
    );
    expect(result.linearWebhookSetup.mode).toBe("existing-unverified");
    expect(result.verified).toBe(false);
    expect(result.candidateSecretSource).toBe("unreadable");
  });

  it("returns setup-blocked when no READY production deployment exists for auto-redeploy", async () => {
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: false,
      result: "auth_failed",
      reason: "invalid_signature",
      probedAt: new Date().toISOString(),
    });
    vi.mocked(findLatestReadyProductionDeploymentId).mockResolvedValue(undefined);

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(result.productionRedeployTriggered).toBe(false);
    expect(result.productionRedeployStatus).toBe("no_source_deployment");
    expect(result.setupBlocked?.message).toMatch(/No READY production deployment/i);
    expect(triggerProductionRedeployOnce).not.toHaveBeenCalled();
  });

  it("returns failed redeploy state when production redeploy trigger fails", async () => {
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: false,
      result: "auth_failed",
      reason: "invalid_signature",
      probedAt: new Date().toISOString(),
    });
    vi.mocked(triggerProductionRedeployOnce).mockResolvedValue({
      status: "failed",
      sourceDeploymentId: "dpl-source-1",
      message: "Vercel API 500 on /v13/deployments",
    });

    const result = await applyVercelBridgeSetup({
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      confirmed: true,
      fingerprint: "preview-fingerprint",
      cwd: tempRoot,
    });

    expect(result.productionRedeployTriggered).toBe(false);
    expect(result.productionRedeployStatus).toBe("failed");
    expect(result.setupBlocked?.message).toContain("Vercel API 500");
    expect(result.setupPending).toBeFalsy();
    expect(result.verified).toBe(false);
  });
});
