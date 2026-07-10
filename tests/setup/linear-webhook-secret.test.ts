import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/setup/linear-setup-plan.js", () => ({
  summarizeLinearWebhookReadiness: vi.fn(),
}));

vi.mock("../../src/setup/linear-setup-client.js", () => ({
  createLinearSetupClient: vi.fn(),
  listLinearWebhooks: vi.fn(),
  createLinearIssueWebhook: vi.fn(),
}));

import {
  createLinearIssueWebhook,
  createLinearSetupClient,
  listLinearWebhooks,
} from "../../src/setup/linear-setup-client.js";
import { summarizeLinearWebhookReadiness } from "../../src/setup/linear-setup-plan.js";
import {
  ensureLinearIssueWebhook,
  generateLinearWebhookSecret,
  planLinearWebhookSecret,
} from "../../src/setup/linear-webhook-secret.js";

describe("linear-webhook-secret", () => {
  beforeEach(() => {
    vi.mocked(createLinearSetupClient).mockReturnValue({} as never);
    vi.mocked(listLinearWebhooks).mockResolvedValue([]);
    vi.mocked(summarizeLinearWebhookReadiness).mockResolvedValue({
      matchingWebhook: undefined,
      manualSteps: [],
    });
  });

  it("generates high-entropy webhook secrets", () => {
    const secret = generateLinearWebhookSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(generateLinearWebhookSecret()).not.toBe(secret);
  });

  it("plans manual-copy when Linear API key is missing", async () => {
    const plan = await planLinearWebhookSecret({
      webhookUrl: "https://example.vercel.app/api/linear-webhook",
    });

    expect(plan.mode).toBe("manual-copy");
    expect(plan.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.manualSteps.join(" ")).toMatch(/LINEAR_API_KEY/i);
  });

  it("plans existing-unverified when a matching webhook already exists", async () => {
    vi.mocked(summarizeLinearWebhookReadiness).mockResolvedValue({
      matchingWebhook: {
        id: "wh-1",
        url: "https://example.vercel.app/api/linear-webhook",
        enabled: true,
        resourceTypes: ["Issue"],
      },
      manualSteps: [],
    });

    const plan = await planLinearWebhookSecret({
      linearApiKey: "lin_api_test",
      webhookUrl: "https://example.vercel.app/api/linear-webhook",
      linearTeamId: "team-1",
    });

    expect(plan.mode).toBe("existing-unverified");
    expect(plan.secret).toBeUndefined();
    expect(plan.manualSteps.join(" ")).toMatch(/cannot be recovered/i);
  });

  it("creates a Linear webhook when none exists and returns automated mode", async () => {
    vi.mocked(createLinearIssueWebhook).mockResolvedValue({
      id: "wh-new",
      url: "https://example.vercel.app/api/linear-webhook",
      enabled: true,
      resourceTypes: ["Issue"],
      secret: "generated-secret-from-linear",
    });

    const result = await ensureLinearIssueWebhook({
      linearApiKey: "lin_api_test",
      webhookUrl: "https://example.vercel.app/api/linear-webhook",
      linearTeamId: "team-1",
      secret: "local-generated-secret",
    });

    expect(createLinearIssueWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        url: "https://example.vercel.app/api/linear-webhook",
        teamId: "team-1",
        secret: "local-generated-secret",
      }),
    );
    expect(result.mode).toBe("automated");
    expect(result.secret).toBe("generated-secret-from-linear");
  });

  it("falls back to manual-copy when webhook creation fails", async () => {
    vi.mocked(createLinearIssueWebhook).mockRejectedValue(new Error("API unavailable"));

    const result = await ensureLinearIssueWebhook({
      linearApiKey: "lin_api_test",
      webhookUrl: "https://example.vercel.app/api/linear-webhook",
      secret: "local-generated-secret",
    });

    expect(result.mode).toBe("manual-copy");
    expect(result.secret).toBe("local-generated-secret");
    expect(result.manualSteps.join(" ")).toMatch(/Create a Linear Issue webhook/i);
  });
});
