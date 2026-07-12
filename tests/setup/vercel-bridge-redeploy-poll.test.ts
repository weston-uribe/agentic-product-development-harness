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
    inspectProductionRedeployStatus: vi.fn(),
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
  resolveLinearWebhookCandidateSecret,
} from "../../src/setup/linear-webhook-secret.js";
import {
  listVercelProjectEnvVars,
  listVercelProjects,
  listVercelTeams,
  summarizeRequiredEnvPresence,
} from "../../src/setup/vercel-setup-client.js";
import {
  previewVercelBridgeSetup,
  VERCEL_SETUP_ACTIONS,
} from "../../src/setup/vercel-setup-plan.js";
import { pollVercelBridgeRedeployVerification } from "../../src/setup/vercel-bridge-redeploy-poll.js";
import { inspectProductionRedeployStatus } from "../../src/setup/vercel-production-redeploy.js";

const previewResult = {
  actionId: VERCEL_SETUP_ACTIONS.preview.id,
  teams: [],
  projects: [{ id: "proj-1", name: "harness-gui", accountId: "acct-1" }],
  selectedProject: { id: "proj-1", name: "harness-gui", accountId: "acct-1" },
  productionUrl: "https://harness-gui.vercel.app",
  webhookUrl: "https://harness-gui.vercel.app/api/linear-webhook",
  deploymentStatus: "ready" as const,
  endpointReachable: true,
  envWritePlan: [],
  requiredEnvPresence: {
    LINEAR_WEBHOOK_SECRET: "present",
    GITHUB_DISPATCH_TOKEN: "present",
    HARNESS_TEAM_KEY: "present",
  },
  linearWebhookVerified: true,
  readiness: { ready: false, blockers: [], warnings: [] },
  manualSteps: [],
  fingerprint: "preview-fingerprint",
  permission: VERCEL_SETUP_ACTIONS.preview.permission,
} as const;

const pendingVerification = {
  actionId: "vercel-redeploy-test",
  projectId: "proj-1",
  projectName: "harness-gui",
  webhookUrl: "https://harness-gui.vercel.app/api/linear-webhook",
  fingerprint: "preview-fingerprint",
  sourceDeploymentId: "dpl-source-1",
  newDeploymentId: "dpl-new-1",
  status: "triggered" as const,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deadlineAt: new Date(Date.now() + 300_000).toISOString(),
  verifyAttempted: false,
};

const baseVercelState = {
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
  redeployVerification: pendingVerification,
};

describe("vercel-bridge-redeploy-poll", () => {
  let tempRoot = "";
  let storedState: {
    version: 1;
    vercel: typeof baseVercelState;
  };

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "vercel-bridge-redeploy-poll-"));
    await mkdir(path.join(tempRoot, ".harness"), { recursive: true });

    vi.clearAllMocks();
    storedState = {
      version: 1,
      vercel: {
        ...baseVercelState,
        redeployVerification: { ...pendingVerification },
      },
    };
    vi.mocked(readControlPlaneSetupState).mockImplementation(async () => storedState);
    vi.mocked(resolveLinearWebhookCandidateSecret).mockResolvedValue({
      secret: "stable-webhook-secret",
      source: "reused-readable",
      manualSteps: [],
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
    vi.mocked(previewVercelBridgeSetup).mockResolvedValue(previewResult);
    vi.mocked(listVercelTeams).mockResolvedValue([
      { id: "team-1", name: "Acme", slug: "acme" },
    ]);
    vi.mocked(listVercelProjects).mockResolvedValue([
      { id: "proj-1", name: "harness-gui", accountId: "acct-1" },
    ]);
    vi.mocked(listVercelProjectEnvVars).mockResolvedValue([
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
    vi.mocked(updateControlPlaneSetupState).mockImplementation(async (patch) => {
      storedState = {
        version: 1,
        vercel: {
          ...storedState.vercel,
          ...patch.vercel,
        },
      };
      return storedState;
    });
    vi.mocked(inspectProductionRedeployStatus).mockResolvedValue({
      status: "building",
      sourceDeploymentId: "dpl-source-1",
      newDeploymentId: "dpl-new-1",
      message: "Waiting for Vercel deployment READY…",
    });
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: true,
      result: "accepted_ignored",
      reason: "ignored_event",
      probedAt: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("returns building state while deployment is not READY", async () => {
    const result = await pollVercelBridgeRedeployVerification({
      actionId: "vercel-redeploy-test",
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
      },
      cwd: tempRoot,
    });

    expect(result.setupPending).toBe(true);
    expect(result.productionRedeployStatus).toBe("building");
    expect(result.verified).toBe(false);
    expect(ensureLinearIssueWebhook).not.toHaveBeenCalled();
  });

  it("runs verifyOnly retry after deployment becomes READY and marks Step 3 verified", async () => {
    vi.mocked(inspectProductionRedeployStatus).mockResolvedValue({
      status: "ready",
      sourceDeploymentId: "dpl-source-1",
      newDeploymentId: "dpl-new-1",
      message: "Production redeploy completed and deployment is READY.",
    });

    const result = await pollVercelBridgeRedeployVerification({
      actionId: "vercel-redeploy-test",
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      cwd: tempRoot,
    });

    expect(ensureLinearIssueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        mutatePolicy: "verify-only",
        secret: "stable-webhook-secret",
      }),
    );
    expect(result.verified).toBe(true);
    expect(result.signedProbeVerified).toBe(true);
    expect(result.setupPending).toBe(false);
    expect(updateControlPlaneSetupState).toHaveBeenCalledWith(
      expect.objectContaining({
        vercel: expect.objectContaining({
          signedProbeVerified: true,
          deploymentRedeployRequired: false,
          redeployVerification: undefined,
        }),
      }),
      tempRoot,
    );
    expect(JSON.stringify(result)).not.toContain("stable-webhook-secret");
    expect(JSON.stringify(result)).not.toContain("ghp_saved");
  });

  it("returns setupBlocked when post-redeploy verifyOnly retry still fails", async () => {
    vi.mocked(inspectProductionRedeployStatus).mockResolvedValue({
      status: "ready",
      sourceDeploymentId: "dpl-source-1",
      newDeploymentId: "dpl-new-1",
      message: "Production redeploy completed and deployment is READY.",
    });
    vi.mocked(runSignedWebhookProbe).mockResolvedValue({
      passed: false,
      result: "auth_failed",
      reason: "invalid_signature",
      probedAt: new Date().toISOString(),
    });

    const result = await pollVercelBridgeRedeployVerification({
      actionId: "vercel-redeploy-test",
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
        derivedHarnessTeamKey: "WES",
        derivedGithubDispatchToken: "ghp_saved",
      },
      cwd: tempRoot,
    });

    expect(result.setupBlocked?.message).toMatch(
      /Production redeploy completed, but signed webhook delivery verification still failed/i,
    );
    expect(result.setupPending).toBe(false);
    expect(result.verified).toBe(false);
  });

  it("returns timeout setupBlocked and keeps retry visible", async () => {
    vi.mocked(inspectProductionRedeployStatus).mockResolvedValue({
      status: "timeout",
      sourceDeploymentId: "dpl-source-1",
      newDeploymentId: "dpl-new-1",
      message:
        "Production redeploy did not reach READY before the timeout. Retry verification after Vercel finishes building.",
    });

    const result = await pollVercelBridgeRedeployVerification({
      actionId: "vercel-redeploy-test",
      plan: {
        vercelToken: "vercel-token",
        projectId: "proj-1",
        linearApiKey: "lin_api_test",
      },
      cwd: tempRoot,
    });

    expect(result.productionRedeployStatus).toBe("timeout");
    expect(result.setupBlocked?.message).toMatch(/timeout/i);
    expect(result.setupPending).toBe(false);
  });

  it("does not run verifyOnly twice when polling races after READY", async () => {
    vi.mocked(inspectProductionRedeployStatus).mockResolvedValue({
      status: "ready",
      sourceDeploymentId: "dpl-source-1",
      newDeploymentId: "dpl-new-1",
      message: "Production redeploy completed and deployment is READY.",
    });

    await Promise.all([
      pollVercelBridgeRedeployVerification({
        actionId: "vercel-redeploy-test",
        plan: {
          vercelToken: "vercel-token",
          projectId: "proj-1",
          linearApiKey: "lin_api_test",
          derivedHarnessTeamKey: "WES",
          derivedGithubDispatchToken: "ghp_saved",
        },
        cwd: tempRoot,
      }),
      pollVercelBridgeRedeployVerification({
        actionId: "vercel-redeploy-test",
        plan: {
          vercelToken: "vercel-token",
          projectId: "proj-1",
          linearApiKey: "lin_api_test",
          derivedHarnessTeamKey: "WES",
          derivedGithubDispatchToken: "ghp_saved",
        },
        cwd: tempRoot,
      }),
    ]);

    expect(ensureLinearIssueWebhook).toHaveBeenCalledTimes(1);
  });
});
