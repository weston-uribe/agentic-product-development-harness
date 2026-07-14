import { describe, expect, it } from "vitest";
import { createSentryErrorTransport } from "../../src/observability/adapters/sentry.js";
import { ALLOWED_SENTRY_TAG_KEYS } from "../../src/observability/privacy-schema.js";

const PRIVACY_FIXTURE = [
  "ghp_1234567890abcdef",
  "weston@example.com",
  "/Users/weston/Code/secret-repo",
  "https://github.com/weston/private-repo?token=abc",
].join(" ");

describe("observability sentry adapter envelope", () => {
  it("rebuilds the outbound event to the approved privacy schema", async () => {
    const captured: unknown[] = [];
    const transport = createSentryErrorTransport({
      dsn: "http://public@127.0.0.1:9999/1",
      release: "p-dev-harness@0.3.1",
      transport: {
        send: async (envelope) => {
          captured.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
        close: async () => {},
      } as never,
    });

    transport.captureError(
      {
        lifecyclePhase: "provisioning",
        productErrorCode: "provision_failed",
        errorCategory: "server",
        message: PRIVACY_FIXTURE,
        cause: new Error(PRIVACY_FIXTURE),
      },
      {
        observability_schema_version: 1,
        package_version: "0.3.1",
        release_sha: "abc123",
        session_id: "session-123",
        runtime_mode: "packaged",
        os_family: "linux",
        cpu_arch_family: "x64",
        node_major_version: 22,
        lifecycle_phase: "provisioning",
      },
    );

    await transport.flush(2_000);

    const serialized = JSON.stringify(captured);
    expect(serialized).toContain("provision_failed");
    expect(serialized).not.toContain("ghp_1234567890abcdef");
    expect(serialized).not.toContain("weston@example.com");
    expect(serialized).not.toContain("/Users/weston");
    expect(serialized).not.toContain("token=abc");
    for (const key of ALLOWED_SENTRY_TAG_KEYS) {
      if (serialized.includes(`"${key}"`)) {
        expect(ALLOWED_SENTRY_TAG_KEYS).toContain(key);
      }
    }
  });
});
