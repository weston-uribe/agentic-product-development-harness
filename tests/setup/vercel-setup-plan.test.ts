import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/setup/vercel-setup-client.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/setup/vercel-setup-client.js")>();
  return {
    ...actual,
    buildWebhookUrl: vi.fn((url: string) => `https://${url}/api/linear-webhook`),
    checkWebhookEndpointReachable: vi.fn(),
    listVercelProductionDeployments: vi.fn(),
    listVercelProjectEnvVars: vi.fn(),
    listVercelProjects: vi.fn(),
    listVercelTeams: vi.fn(),
    summarizeRequiredEnvPresence: vi.fn(),
  };
});

vi.mock("../../src/setup/linear-setup-plan.js", () => ({
  summarizeLinearWebhookReadiness: vi.fn(),
}));

vi.mock("../../src/setup/linear-webhook-secret.js", () => ({
  planLinearWebhookSecret: vi.fn(),
}));

import { summarizeLinearWebhookReadiness } from "../../src/setup/linear-setup-plan.js";
import { planLinearWebhookSecret } from "../../src/setup/linear-webhook-secret.js";
import {
  listVercelProductionDeployments,
  listVercelProjectEnvVars,
  listVercelProjects,
  listVercelTeams,
  summarizeRequiredEnvPresence,
  checkWebhookEndpointReachable,
} from "../../src/setup/vercel-setup-client.js";
import {
  previewVercelBridgeSetup,
  resolveVercelBridgeEnvValue,
} from "../../src/setup/vercel-setup-plan.js";

describe("vercel-setup-plan", () => {
  beforeEach(() => {
    vi.mocked(listVercelTeams).mockResolvedValue([]);
    vi.mocked(listVercelProjects).mockResolvedValue([
      { id: "proj-1", name: "harness-gui", accountId: "acct-1" },
    ]);
    vi.mocked(listVercelProductionDeployments).mockResolvedValue([
      {
        id: "dep-1",
        url: "harness-gui.vercel.app",
        readyState: "READY",
        state: "READY",
      },
    ]);
    vi.mocked(checkWebhookEndpointReachable).mockResolvedValue({
      reachable: true,
      statusCode: 405,
    });
    vi.mocked(listVercelProjectEnvVars).mockResolvedValue([]);
    vi.mocked(summarizeRequiredEnvPresence).mockReturnValue({
      LINEAR_WEBHOOK_SECRET: "missing",
      GITHUB_DISPATCH_TOKEN: "missing",
      HARNESS_TEAM_KEY: "missing",
    });
    vi.mocked(summarizeLinearWebhookReadiness).mockResolvedValue({
      matchingWebhook: undefined,
      manualSteps: [],
    });
    vi.mocked(planLinearWebhookSecret).mockResolvedValue({
      mode: "automated",
      secret: "generated-secret",
      manualSteps: [],
    });
  });

  it("resolves derived and generated env values without operator input", () => {
    expect(
      resolveVercelBridgeEnvValue({
        key: "HARNESS_TEAM_KEY",
        derivedHarnessTeamKey: "WES",
      }),
    ).toBe("WES");
    expect(
      resolveVercelBridgeEnvValue({
        key: "GITHUB_DISPATCH_TOKEN",
        derivedGithubDispatchToken: "ghp_saved",
      }),
    ).toBe("ghp_saved");
    expect(
      resolveVercelBridgeEnvValue({
        key: "LINEAR_WEBHOOK_SECRET",
        generatedLinearWebhookSecret: "generated-secret",
      }),
    ).toBe("generated-secret");
  });

  it("plans derived harness team key and generated webhook secret in preview", async () => {
    const preview = await previewVercelBridgeSetup({
      vercelToken: "vercel-token",
      projectId: "proj-1",
      derivedHarnessTeamKey: "WES",
      derivedGithubDispatchToken: "ghp_saved",
      willGenerateLinearWebhookSecret: true,
      linearApiKey: "lin_api_test",
    });

    expect(preview.validationError).toBeUndefined();
    expect(preview.githubDispatchSource).toBe("saved-github-token");
    expect(preview.linearWebhookSecretMode).toBe("automated");
    expect(preview.envWritePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "HARNESS_TEAM_KEY",
          source: "derived",
          action: "create",
          desiredType: "plain",
        }),
        expect.objectContaining({
          key: "GITHUB_DISPATCH_TOKEN",
          source: "derived",
          action: "create",
          desiredType: "sensitive",
        }),
        expect.objectContaining({
          key: "LINEAR_WEBHOOK_SECRET",
          source: "generated",
          action: "create",
          desiredType: "sensitive",
        }),
      ]),
    );
    expect(JSON.stringify(preview)).not.toContain("ghp_saved");
    expect(JSON.stringify(preview)).not.toContain("generated-secret");
  });

  it("validates create-new project mode without failing preview", async () => {
    const preview = await previewVercelBridgeSetup({
      vercelToken: "vercel-token",
      team: { mode: "existing", teamId: "" },
      project: { mode: "create", projectName: "harness-configure-step3-test" },
      derivedHarnessTeamKey: "WES",
      derivedGithubDispatchToken: "ghp_saved",
      willGenerateLinearWebhookSecret: true,
    });

    expect(preview.validationError).toBeUndefined();
    expect(preview.selectedProject).toBeUndefined();
    expect(preview.deploymentStatus).toBe("project-will-be-created");
    expect(preview.manualSteps.join(" ")).toMatch(/will be created during apply/i);
  });

  it("reports missing deployment for existing projects without production URL", async () => {
    vi.mocked(listVercelProductionDeployments).mockResolvedValue([]);

    const preview = await previewVercelBridgeSetup({
      vercelToken: "vercel-token",
      projectId: "proj-1",
      derivedHarnessTeamKey: "WES",
      derivedGithubDispatchToken: "ghp_saved",
    });

    expect(preview.deploymentStatus).toBe("missing");
    expect(preview.deploymentRequired?.message).toMatch(/no production deployment/i);
    expect(preview.webhookUrl).toBeUndefined();
  });

  it("plans generated webhook secret as update when Vercel already has LINEAR_WEBHOOK_SECRET", async () => {
    vi.mocked(listVercelProjectEnvVars).mockResolvedValue([
      {
        id: "env-linear",
        key: "LINEAR_WEBHOOK_SECRET",
        type: "sensitive",
        target: ["production"],
      },
    ]);

    const preview = await previewVercelBridgeSetup({
      vercelToken: "vercel-token",
      projectId: "proj-1",
      derivedHarnessTeamKey: "WES",
      derivedGithubDispatchToken: "ghp_saved",
      willGenerateLinearWebhookSecret: true,
      linearApiKey: "lin_api_test",
    });

    expect(preview.envWritePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "LINEAR_WEBHOOK_SECRET",
          action: "update",
          source: "generated",
        }),
      ]),
    );
    expect(preview.linearWebhookVerified).toBe(false);
    expect(preview.signedProbeVerified).toBe(false);
  });

  it("does not treat existing-unverified webhook mode as verified", async () => {
    vi.mocked(summarizeLinearWebhookReadiness).mockResolvedValue({
      matchingWebhook: {
        id: "wh-1",
        url: "https://harness-gui.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
      manualSteps: [],
    });
    vi.mocked(planLinearWebhookSecret).mockResolvedValue({
      mode: "existing-unverified",
      manualSteps: ["Signing secret cannot be recovered."],
    });

    const preview = await previewVercelBridgeSetup({
      vercelToken: "vercel-token",
      projectId: "proj-1",
      linearApiKey: "lin_api_test",
      derivedHarnessTeamKey: "WES",
    });

    expect(preview.linearWebhookSecretMode).toBe("existing-unverified");
    expect(preview.linearWebhookVerified).toBe(false);
  });
});
