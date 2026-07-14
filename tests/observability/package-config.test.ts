import { describe, expect, it } from "vitest";
import { parseObservabilityPublicConfigJson } from "../../src/observability/package-config.js";

describe("observability foundation package config", () => {
  it("accepts empty public ingestion values", () => {
    const parsed = parseObservabilityPublicConfigJson(
      JSON.stringify({
        observabilitySchemaVersion: 1,
        sentryPublicDsn: "",
        posthogProjectToken: "",
        posthogIngestionHost: "https://us.i.posthog.com",
      }),
      "test",
    );
    expect(parsed.sentryPublicDsn).toBe("");
    expect(parsed.posthogProjectToken).toBe("");
  });
});
