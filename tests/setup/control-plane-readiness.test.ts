import { describe, expect, it } from "vitest";
import { deriveVercelBridgeReadiness } from "../../src/setup/vercel-bridge-readiness.js";
import { getDispatchTriggerStatuses } from "../../src/setup/linear-status-contract.js";
import { requiredStatusNames } from "../../src/setup/linear-status-contract.js";

describe("vercel bridge readiness", () => {
  it("reports ready when all bridge checks pass", () => {
    const readiness = deriveVercelBridgeReadiness({
      projectId: "prj_1",
      productionUrl: "https://bridge.vercel.app",
      webhookUrl: "https://bridge.vercel.app/api/linear-webhook",
      endpointReachable: true,
      requiredEnvPresence: {
        LINEAR_WEBHOOK_SECRET: "present",
        GITHUB_DISPATCH_TOKEN: "present",
        HARNESS_TEAM_KEY: "present",
      },
      linearWebhookVerified: true,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toHaveLength(0);
  });

  it("allows manual complete override", () => {
    const readiness = deriveVercelBridgeReadiness({
      manualComplete: true,
    });

    expect(readiness.ready).toBe(true);
  });
});

describe("linear status contract", () => {
  it("includes engineering review and dispatch triggers", () => {
    const names = requiredStatusNames();
    expect(names).toContain("Engineering Review");
    expect(names).not.toContain("Plan Review");
    expect(getDispatchTriggerStatuses()).toContain("Ready for Planning");
  });
});
