import { describe, expect, it } from "vitest";
import {
  createGuidedRepoRowId,
  guidedRowsFromConfig,
  guidedRowsToConfigRepos,
  isRepoVerifiedForUrl,
  isServiceFailedForValue,
  isServiceVerifiedForValue,
  valueFingerprint,
} from "../../apps/gui/lib/verification-state.js";

describe("verification-state helpers", () => {
  it("creates stable fingerprints without exposing secret values", () => {
    const fingerprint = valueFingerprint("secret-token-value");
    expect(fingerprint).toMatch(/^fp:-?\d+:\d+$/);
    expect(fingerprint).not.toContain("secret-token-value");
  });

  it("detects service verification for the exact current value", () => {
    const token = "linear-token-abc";
    const verification = {
      state: "connected" as const,
      verifiedValueFingerprint: valueFingerprint(token),
      message: "Connected as Weston Uribe",
    };

    expect(isServiceVerifiedForValue(verification, token)).toBe(true);
    expect(isServiceVerifiedForValue(verification, "different-token")).toBe(
      false,
    );
  });

  it("detects failed service verification for the exact attempted value", () => {
    const token = "bad-token";
    const verification = {
      state: "failed" as const,
      attemptedValueFingerprint: valueFingerprint(token),
      message: "Linear rejected this key",
    };

    expect(isServiceFailedForValue(verification, token)).toBe(true);
    expect(isServiceFailedForValue(verification, "other-token")).toBe(false);
  });

  it("detects repo verification for the exact current URL", () => {
    const url = "https://github.com/acme/my-product";
    const verification = {
      state: "connected" as const,
      verifiedTargetRepo: url,
      message: "Connected to acme/my-product",
    };

    expect(isRepoVerifiedForUrl(verification, url)).toBe(true);
    expect(
      isRepoVerifiedForUrl(
        verification,
        "https://github.com/acme/another-app",
      ),
    ).toBe(false);
  });

  it("creates guided repo rows with stable row ids", () => {
    const rows = guidedRowsFromConfig(
      {
        repos: [
          { id: "", targetRepo: "https://github.com/acme/repo-one" },
          { id: "", targetRepo: "https://github.com/acme/repo-two" },
        ],
      },
      1,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.rowId).toBeTruthy();
    expect(rows[1]?.rowId).toBeTruthy();
    expect(rows[0]?.rowId).not.toBe(rows[1]?.rowId);
    expect(guidedRowsToConfigRepos(rows)).toEqual([
      { id: "", targetRepo: "https://github.com/acme/repo-one" },
      { id: "", targetRepo: "https://github.com/acme/repo-two" },
    ]);
  });

  it("creates unique guided repo row ids", () => {
    const id1 = createGuidedRepoRowId(1);
    const id2 = createGuidedRepoRowId(2);
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});
