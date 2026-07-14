import { describe, expect, it } from "vitest";
import { createSentryErrorTransport } from "../../src/observability/adapters/sentry.js";
import { ALLOWED_SENTRY_TAG_KEYS } from "../../src/observability/privacy-schema.js";
import type { ErrorEvent } from "@sentry/node";

const PRIVACY_FIXTURE = [
  "ghp_1234567890abcdef",
  "weston@example.com",
  "/Users/weston/Code/secret-repo",
  "https://github.com/weston/private-repo?token=abc",
].join(" ");

const BASE_CONTEXT = {
  observability_schema_version: 1,
  package_version: "0.3.1",
  release_sha: "abc123",
  session_id: "session-123",
  runtime_mode: "packaged",
  os_family: "linux",
  cpu_arch_family: "x64",
  node_major_version: 22,
  lifecycle_phase: "provisioning",
} as const;

function envelopeEvent(envelope: unknown): ErrorEvent {
  const event = (envelope as [unknown, Array<[unknown, ErrorEvent]>])[1]?.[0]?.[1];
  if (!event) {
    throw new Error(`Missing Sentry event in envelope: ${JSON.stringify(envelope)}`);
  }
  return event;
}

describe("observability sentry adapter envelope", () => {
  it("constructs the outbound event to the approved privacy schema", async () => {
    const captured: unknown[] = [];
    const transport = createSentryErrorTransport({
      dsn: "http://public@127.0.0.1:9999/1",
      release: "p-dev-harness@0.3.1",
      transport: () =>
        ({
          send: async (envelope: unknown) => {
            captured.push(envelope);
            return { statusCode: 200 };
          },
          flush: async () => true,
          close: async () => undefined,
        }) as never,
    });

    transport.captureError(
      {
        lifecyclePhase: "provisioning",
        productErrorCode: "provision_failed",
        errorCategory: "server",
        message: PRIVACY_FIXTURE,
        cause: new Error(PRIVACY_FIXTURE),
      },
      BASE_CONTEXT,
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

  it("keeps concurrent captures bound to their own product metadata", async () => {
    const captured: unknown[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstSendBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let sendCount = 0;
    const transport = createSentryErrorTransport({
      dsn: "http://public@127.0.0.1:9999/1",
      release: "p-dev-harness@0.3.1",
      transport: () =>
        ({
          send: async (envelope: unknown) => {
            sendCount += 1;
            if (sendCount === 1) {
              await firstSendBlocked;
            }
            captured.push(envelope);
            return { statusCode: 200 };
          },
          flush: async () => true,
        }) as never,
    });

    transport.captureError(
      {
        lifecyclePhase: "provisioning",
        productErrorCode: "provision_failed",
        errorCategory: "server",
        cause: new Error("first error"),
      },
      BASE_CONTEXT,
    );
    transport.captureError(
      {
        lifecyclePhase: "configure_route",
        productErrorCode: "configure_request_error",
        errorCategory: "unexpected",
        cause: new Error("second error"),
      },
      { ...BASE_CONTEXT, lifecycle_phase: "configure_route" },
    );
    releaseFirst?.();
    await transport.flush(2_000);

    expect(captured).toHaveLength(2);
    const events = captured.map(envelopeEvent);
    expect(events.map((event) => event.tags?.product_error_code).sort()).toEqual([
      "configure_request_error",
      "provision_failed",
    ]);
    const provisionEvent = events.find(
      (event) => event.tags?.product_error_code === "provision_failed",
    );
    const configureEvent = events.find(
      (event) => event.tags?.product_error_code === "configure_request_error",
    );
    expect(provisionEvent?.message).toBe("Harness workspace provisioning failed.");
    expect(provisionEvent?.tags?.lifecycle_phase).toBe("provisioning");
    expect(provisionEvent?.fingerprint).toEqual([
      "provision_failed",
      "provisioning",
    ]);
    expect(configureEvent?.message).toBe(
      "A Configure request failed unexpectedly.",
    );
    expect(configureEvent?.tags?.lifecycle_phase).toBe("configure_route");
    expect(configureEvent?.fingerprint).toEqual([
      "configure_request_error",
      "configure_route",
    ]);
  });

  it("drops uninitiated events on consent withdrawal without starting later sends", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstSendBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const initiated: number[] = [];
    const captured: unknown[] = [];
    const transport = createSentryErrorTransport({
      dsn: "http://public@127.0.0.1:9999/1",
      release: "p-dev-harness@0.3.1",
      transport: () =>
        ({
          send: async (envelope: unknown) => {
            initiated.push(Date.now());
            captured.push(envelope);
            await firstSendBlocked;
            return { statusCode: 200 };
          },
          flush: async () => true,
        }) as never,
    });

    transport.captureError(
      {
        lifecyclePhase: "provisioning",
        productErrorCode: "provision_failed",
        errorCategory: "server",
      },
      BASE_CONTEXT,
    );
    await new Promise((resolve) => queueMicrotask(resolve));
    expect(initiated).toHaveLength(1);

    transport.captureError(
      {
        lifecyclePhase: "configure_route",
        productErrorCode: "configure_request_error",
        errorCategory: "unexpected",
      },
      { ...BASE_CONTEXT, lifecycle_phase: "configure_route" },
    );
    const gateClosedAt = Date.now();
    const disableStarted = Date.now();
    await transport.disableAndDrop(25);
    const disableElapsed = Date.now() - disableStarted;
    transport.captureError(
      {
        lifecyclePhase: "shutdown",
        productErrorCode: "p_dev_launch_failed",
        errorCategory: "unexpected",
      },
      { ...BASE_CONTEXT, lifecycle_phase: "shutdown" },
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    releaseFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(disableElapsed).toBeLessThan(150);
    expect(initiated).toHaveLength(1);
    expect(initiated.every((timestamp) => timestamp <= gateClosedAt)).toBe(true);
    expect(captured.map(envelopeEvent)[0]?.tags?.product_error_code).toBe(
      "provision_failed",
    );
    expect(transport.isActive()).toBe(false);
  });
});
