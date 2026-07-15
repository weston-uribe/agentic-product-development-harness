import { describe, expect, it } from "vitest";
import {
  assertSentryEnvelopePrivacy,
  findSentryPrivacyViolation,
  scrubOutboundSentryEnvelope,
} from "../../src/observability/sentry-outbound-privacy.js";
import { ALLOWED_SENTRY_TAG_KEYS } from "../../src/observability/privacy-schema.js";
import type { ErrorEvent } from "@sentry/node";

describe("sentry outbound privacy helpers", () => {
  it("documents the allowlisted sentry tag contract", () => {
    expect(ALLOWED_SENTRY_TAG_KEYS).toContain("package_version");
    expect(ALLOWED_SENTRY_TAG_KEYS).toContain("release_sha");
    expect(ALLOWED_SENTRY_TAG_KEYS).not.toContain("installationId");
  });

  it("throws loudly when assertions detect forbidden envelope fields", () => {
    const envelope = [
      { event_id: "abc", sent_at: new Date().toISOString(), trace: { trace_id: "1" } },
      [[{ type: "event" }, { message: "x", tags: {} }]],
    ] as never;

    expect(() => assertSentryEnvelopePrivacy(envelope)).toThrow(/trace metadata/i);
  });

  it("strips forbidden trace metadata from structured envelopes", () => {
    const envelope = [
      {
        event_id: "abc",
        sent_at: new Date().toISOString(),
        trace: { trace_id: "abc", public_key: "key" },
      },
      [
        [
          { type: "event" },
          {
            message: "Harness workspace provisioning failed.",
            tags: {
              observability_schema_version: "1",
              package_version: "0.3.1",
              release_sha: "abc",
              session_id: "session",
              runtime_mode: "packaged",
              os_family: "linux",
              cpu_arch_family: "x64",
              node_major_version: "22",
              lifecycle_phase: "provisioning",
              product_error_code: "provision_failed",
              error_category: "server",
            },
            fingerprint: ["provision_failed", "provisioning"],
          } satisfies ErrorEvent,
        ],
      ],
    ] as never;

    const scrubbed = scrubOutboundSentryEnvelope(envelope);
    expect(scrubbed).not.toBeNull();
    expect(scrubbed?.[0].trace).toBeUndefined();
    expect(() => assertSentryEnvelopePrivacy(scrubbed as never)).not.toThrow();
    expect(findSentryPrivacyViolation({ trace_id: "abc" })).toEqual({
      path: "$.trace_id",
      reason: 'Forbidden key "trace_id"',
    });
  });
});
