import { describe, expect, it } from "vitest";
import {
  buildHarnessProvisioningPreviewContext,
  compareHarnessProvisioningPreviewContexts,
  diagnoseHarnessProvisioningFingerprintMismatch,
  serializeHarnessProvisioningPreviewContext,
} from "../../src/setup/harness-provisioning-context.js";

const TEMPLATE_IDENTITY = {
  schemaVersion: 1,
  product: "p-dev",
  role: "harness-template",
  templateIdentity: "p-dev-harness-template",
  templateVersion: 1,
  compatibilityVersion: 1,
  templateContentId: "template-content-v1",
};

function buildContext(
  overrides: Partial<Parameters<typeof buildHarnessProvisioningPreviewContext>[0]> = {},
) {
  return buildHarnessProvisioningPreviewContext({
    operationId: "op-1",
    user: { id: 1, login: "Test-User" },
    destination: "Test-User/p-dev-harness",
    templateDefaultBranch: "main",
    templateHeadSha: "abc123templatehead",
    templateIdentity: TEMPLATE_IDENTITY,
    classification: "absent",
    envBaseline: "",
    pDevVersion: "0.0.0",
    resumedFromPending: false,
    creationPreviewFingerprint: null,
    ...overrides,
  });
}

describe("harness provisioning context", () => {
  it("normalizes login and destination casing in serialized fingerprints", () => {
    const context = buildContext();
    const fingerprint = serializeHarnessProvisioningPreviewContext(context);
    const parsed = JSON.parse(fingerprint) as {
      authenticatedLogin: string;
      destination: string;
    };
    expect(parsed.authenticatedLogin).toBe("test-user");
    expect(parsed.destination).toBe("test-user/p-dev-harness");
  });

  it("accepts unchanged preview then apply context", () => {
    const current = buildContext();
    const fingerprint = serializeHarnessProvisioningPreviewContext(current);
    const diagnosis = diagnoseHarnessProvisioningFingerprintMismatch({
      submittedFingerprint: fingerprint,
      currentContext: current,
    });
    expect(diagnosis.ok).toBe(true);
  });

  it("rejects genuine template HEAD changes with a redacted field name", () => {
    const submitted = serializeHarnessProvisioningPreviewContext(buildContext());
    const current = buildContext({ templateHeadSha: "different-head" });
    const diagnosis = diagnoseHarnessProvisioningFingerprintMismatch({
      submittedFingerprint: submitted,
      currentContext: current,
    });
    expect(diagnosis.ok).toBe(false);
    if (!diagnosis.ok) {
      expect(diagnosis.mismatchedField).toBe("templateHeadSha");
      expect(diagnosis.message).not.toContain("ghp_");
    }
  });

  it("rejects pDevVersion mismatch", () => {
    const submitted = serializeHarnessProvisioningPreviewContext(buildContext());
    const current = buildContext({ pDevVersion: "0.2.0" });
    const comparison = compareHarnessProvisioningPreviewContexts(
      buildContext(),
      current,
    );
    expect(comparison.ok).toBe(false);
    if (!comparison.ok) {
      expect(comparison.mismatchedField).toBe("pDevVersion");
    }
    const diagnosis = diagnoseHarnessProvisioningFingerprintMismatch({
      submittedFingerprint: submitted,
      currentContext: current,
    });
    expect(diagnosis.ok).toBe(false);
  });
});
