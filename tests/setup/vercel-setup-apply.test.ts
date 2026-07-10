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

vi.mock("../../src/setup/control-plane-setup-state.js", () => ({
  updateControlPlaneSetupState: vi.fn(),
}));

import { updateControlPlaneSetupState } from "../../src/setup/control-plane-setup-state.js";
import { summarizeLinearWebhookReadiness } from "../../src/setup/linear-setup-plan.js";
import {
  ensureLinearIssueWebhook,
  generateLinearWebhookSecret,
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
    vi.mocked(listVercelProjectEnvVars)
      .mockResolvedValueOnce([
        {
          id: "env-sensitive",
          key: "GITHUB_DISPATCH_TOKEN",
          type: "sensitive",
          target: ["production"],
        },
      ])
      .mockResolvedValueOnce([
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
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    vi.clearAllMocks();
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
  });
});
