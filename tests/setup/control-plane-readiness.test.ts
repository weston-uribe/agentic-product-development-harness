import { describe, expect, it } from "vitest";
import { deriveVercelBridgeReadiness } from "../../src/setup/vercel-bridge-readiness.js";
import { getDispatchTriggerStatuses } from "../../src/setup/linear-status-contract.js";
import { requiredStatusNames } from "../../src/setup/linear-status-contract.js";

function completeBridgeInput() {
  return {
    projectId: "prj_1",
    productionUrl: "https://bridge.vercel.app",
    webhookUrl: "https://bridge.vercel.app/api/linear-webhook",
    endpointReachable: true,
    requiredEnvPresence: {
      LINEAR_WEBHOOK_SECRET: "present" as const,
      GITHUB_DISPATCH_TOKEN: "present" as const,
      HARNESS_TEAM_KEY: "present" as const,
    },
    linearWebhookVerified: true,
    signedProbeVerified: true,
    deploymentRedeployRequired: false,
  };
}

describe("vercel bridge readiness", () => {
  it("reports ready when all bridge checks pass", () => {
    const readiness = deriveVercelBridgeReadiness(completeBridgeInput());

    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toHaveLength(0);
  });

  it("does not allow manual complete override without signed probe", () => {
    const readiness = deriveVercelBridgeReadiness({
      manualComplete: true,
      signedProbeVerified: false,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.manualComplete).toBe(true);
  });

  it("blocks readiness when signed probe has not passed", () => {
    const readiness = deriveVercelBridgeReadiness({
      ...completeBridgeInput(),
      signedProbeVerified: false,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join(" ")).toMatch(/Signed webhook delivery verification/i);
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
