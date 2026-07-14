import * as Sentry from "@sentry/node";
import type {
  AllowedSentryContext,
  ErrorTransport,
  ProductErrorCaptureInput,
  TypedBreadcrumb,
} from "../types.js";
import { ALLOWED_SENTRY_TAG_KEYS } from "../privacy-schema.js";
import {
  sanitizeExceptionCause,
  sanitizeObservabilityString,
  sanitizeStackTrace,
  sanitizeTagRecord,
} from "../redaction.js";
import { P_DEV_SENTRY_ENVIRONMENT_ENV } from "../constants.js";

export interface SentryAdapterOptions {
  dsn: string;
  release: string;
  environment?: string;
}

function filterAllowedTags(
  tags: Record<string, string>,
): Record<string, string> {
  const allowed = new Set<string>(ALLOWED_SENTRY_TAG_KEYS);
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function createSentryErrorTransport(
  options: SentryAdapterOptions,
): ErrorTransport {
  if (!options.dsn.trim()) {
    throw new Error("Sentry adapter requires a non-empty DSN.");
  }

  Sentry.init({
    dsn: options.dsn,
    release: options.release,
    environment:
      options.environment ??
      process.env[P_DEV_SENTRY_ENVIRONMENT_ENV]?.trim() ??
      "packaged",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    integrations: (defaults) =>
      defaults.filter(
        (integration) =>
          integration.name !== "Http" &&
          integration.name !== "Console" &&
          integration.name !== "OnUncaughtException" &&
          integration.name !== "OnUnhandledRejection",
      ),
    beforeSend(event) {
      event.user = undefined;
      event.request = undefined;
      event.breadcrumbs = event.breadcrumbs?.filter(
        (breadcrumb) => breadcrumb.category === "p-dev",
      );
      if (event.tags) {
        event.tags = filterAllowedTags(
          sanitizeTagRecord(event.tags as Record<string, string>),
        );
      }
      if (event.exception?.values) {
        for (const value of event.exception.values) {
          if (value.value) {
            value.value = sanitizeObservabilityString(value.value);
          }
          if (value.stacktrace?.frames) {
            for (const frame of value.stacktrace.frames) {
              if (frame.filename) {
                frame.filename = sanitizeObservabilityString(
                  frame.filename.split("/").pop() ?? frame.filename,
                );
              }
              frame.abs_path = undefined;
              frame.context_line = undefined;
              frame.pre_context = undefined;
              frame.post_context = undefined;
            }
          }
        }
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category !== "p-dev") {
        return null;
      }
      return breadcrumb;
    },
  });

  return {
    captureError(input: ProductErrorCaptureInput, context: AllowedSentryContext) {
      const tags = filterAllowedTags(
        sanitizeTagRecord({
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
      );

      Sentry.withScope((scope) => {
        scope.setTags(tags);
        scope.setFingerprint([input.productErrorCode, input.lifecyclePhase]);
        if (input.cause instanceof Error) {
          const sanitized = sanitizeExceptionCause(input.cause);
          const error = new Error(sanitized.value);
          error.name = sanitized.type;
          if (sanitized.stack) {
            error.stack = sanitizeStackTrace(sanitized.stack);
          }
          Sentry.captureException(error);
          return;
        }
        Sentry.captureMessage(
          sanitizeObservabilityString(
            input.message ?? input.productErrorCode,
          ),
          "error",
        );
      });
    },
    addBreadcrumb(breadcrumb: TypedBreadcrumb) {
      Sentry.addBreadcrumb({
        category: "p-dev",
        message: breadcrumb.kind,
        data: breadcrumb as unknown as Record<string, unknown>,
        level: "info",
      });
    },
    async flush(deadlineMs: number) {
      await Sentry.flush(deadlineMs);
    },
    async shutdown() {
      await Sentry.close(1_000);
    },
  };
}
