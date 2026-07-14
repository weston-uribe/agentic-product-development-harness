import type {
  AllowedSentryContext,
  AnalyticsTransport,
  ErrorTransport,
  FakeTransportRecorder,
  ProductErrorCaptureInput,
  SerializedAnalyticsEvent,
  SerializedSentryEvent,
  TypedBreadcrumb,
} from "../types.js";
import {
  sanitizeExceptionCause,
  sanitizeObservabilityString,
  sanitizeTagRecord,
} from "../redaction.js";

export function createFakeTransportRecorder(): FakeTransportRecorder {
  return {
    analyticsEvents: [],
    sentryEvents: [],
    breadcrumbs: [],
  };
}

export function createFakeAnalyticsTransport(
  recorder: FakeTransportRecorder,
): AnalyticsTransport {
  return {
    capture(event: SerializedAnalyticsEvent) {
      recorder.analyticsEvents.push(structuredClone(event));
    },
    async flush() {
      // no-op
    },
    async shutdown() {
      // no-op
    },
  };
}

export function createFakeErrorTransport(
  recorder: FakeTransportRecorder,
): ErrorTransport {
  return {
    captureError(
      input: ProductErrorCaptureInput,
      context: AllowedSentryContext,
    ) {
      const exception = input.cause
        ? sanitizeExceptionCause(input.cause)
        : undefined;
      const event: SerializedSentryEvent = {
        level: "error",
        message: sanitizeObservabilityString(
          input.message ?? input.productErrorCode,
        ),
        exception,
        tags: sanitizeTagRecord({
          ...context,
          product_error_code: input.productErrorCode,
          error_category: input.errorCategory,
          lifecycle_phase: input.lifecyclePhase,
          configure_step_id: input.configureStepId,
          operation_resumed: input.operationResumed,
          remote_mutation_begun: input.remoteMutationBegun,
          durable_recovery_state_exists: input.durableRecoveryStateExists,
          duration_bucket: input.durationBucket,
          retry_count_bucket: input.retryCountBucket,
          rate_limit_pause_count_bucket: input.rateLimitPauseCountBucket,
        }),
        contexts: {},
        fingerprint: [input.productErrorCode, input.lifecyclePhase],
      };
      recorder.sentryEvents.push(structuredClone(event));
    },
    addBreadcrumb(breadcrumb: TypedBreadcrumb) {
      recorder.breadcrumbs.push(structuredClone(breadcrumb));
    },
    async flush() {
      // no-op
    },
    async shutdown() {
      // no-op
    },
  };
}
