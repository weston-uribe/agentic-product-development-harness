import { describe, expect, it } from "vitest";
import {
  buildPendingValidationContext,
  validatePendingProvisioningState,
  withHarnessProvisioningMutex,
} from "../../src/setup/harness-provisioning-pending-state.js";

describe("harness provisioning pending state", () => {
  it("serializes workspace mutex calls and releases afterward", async () => {
    const order: string[] = [];

    const first = withHarnessProvisioningMutex("/tmp/workspace-a", async () => {
      order.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first-end");
      return "first";
    });

    const second = withHarnessProvisioningMutex("/tmp/workspace-a", async () => {
      order.push("second-start");
      order.push("second-end");
      return "second";
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe("first");
    expect(secondResult).toBe("second");
    expect(order).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);

    let thirdStarted = false;
    await withHarnessProvisioningMutex("/tmp/workspace-a", async () => {
      thirdStarted = true;
    });
    expect(thirdStarted).toBe(true);
  });

  it("validates the full pending provisioning context strictly", () => {
    const pending = {
      operationId: "op-1",
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
      templateHeadSha: "abc123",
      previewFingerprint: "creation-fingerprint",
      startedAt: new Date().toISOString(),
    };

    const valid = validatePendingProvisioningState(
      pending,
      buildPendingValidationContext({
        operationId: "op-1",
        authenticatedUserId: 1,
        authenticatedLogin: "test-user",
        targetOwner: "test-user",
        targetRepo: "p-dev-harness",
        templateIdentity: "p-dev-harness-template",
        templateVersion: 1,
        compatibilityVersion: 1,
        templateContentId: "template-content-v1",
        templateDefaultBranch: "main",
        templateHeadSha: "abc123",
        previewFingerprint: "creation-fingerprint",
      }),
    );
    expect(valid.ok).toBe(true);

    const wrongUser = validatePendingProvisioningState(
      pending,
      buildPendingValidationContext({
        operationId: "op-1",
        authenticatedUserId: 2,
        authenticatedLogin: "other-user",
        targetOwner: "test-user",
        targetRepo: "p-dev-harness",
        templateIdentity: "p-dev-harness-template",
        templateVersion: 1,
        compatibilityVersion: 1,
        templateContentId: "template-content-v1",
        templateDefaultBranch: "main",
        templateHeadSha: "abc123",
        previewFingerprint: "creation-fingerprint",
      }),
    );
    expect(wrongUser.ok).toBe(false);
  });
});
