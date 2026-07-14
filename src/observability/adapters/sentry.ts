import * as Sentry from "@sentry/node";
import type { Event as SentryEvent } from "@sentry/node";
import type {
  AllowedSentryContext,
  ErrorTransport,
  ProductErrorCaptureInput,
  TypedBreadcrumb,
} from "../types.js";
import { ALLOWED_SENTRY_TAG_KEYS } from "../privacy-schema.js";
import { approvedProductErrorMessage } from "../product-error-messages.js";
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
  transport?: Sentry.Transport;
}

function filterAllowedTags(
  tags: Record<string, string>,
): Record<string, string> {
  const allowed = new Set<string>(ALLOWED_SENTRY_TAG_KEYS);
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (allowed.has(key)) {
      filtered[key] = sanitizeObservabilityString(value);
    }
  }
  return filtered;
}

function breadcrumbData(
  breadcrumb: TypedBreadcrumb,
): Record<string, string> {
  switch (breadcrumb.kind) {
    case "lifecycle_phase":
      return { phase: breadcrumb.phase };
    case "configure_step":
      return { step_id: breadcrumb.stepId };
    case "provisioning_checkpoint":
      return { checkpoint: breadcrumb.checkpoint };
    case "retry_bucket":
      return { bucket: breadcrumb.bucket };
    default: {
      const exhaustive: never = breadcrumb;
      return { kind: String(exhaustive) };
    }
  }
}

function rebuildApprovedEvent(
  event: SentryEvent,
  productErrorCode: string,
): SentryEvent | null {
  const tags = filterAllowedTags(
    sanitizeTagRecord((event.tags ?? {}) as Record<string, string>),
  );

  const rebuilt: SentryEvent = {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: "error",
    release: event.release,
    environment: event.environment,
    message: approvedProductErrorMessage(productErrorCode),
    tags,
    fingerprint: [productErrorCode, String(tags.lifecycle_phase ?? "unknown")],
    breadcrumbs: (event.breadcrumbs ?? [])
      .filter((breadcrumb) => breadcrumb.category === "p-dev")
      .map((breadcrumb) => ({
        category: "p-dev",
        message: breadcrumb.message,
        level: breadcrumb.level,
        data: breadcrumb.data,
      })),
  };

  if (event.exception?.values?.[0]) {
    const source = event.exception.values[0];
    rebuilt.exception = {
      values: [
        {
          type: sanitizeObservabilityString(source.type ?? "Error"),
          value: approvedProductErrorMessage(productErrorCode),
          stacktrace: source.stacktrace
            ? {
                frames: (source.stacktrace.frames ?? []).map((frame) => ({
                  filename: frame.filename
                    ? sanitizeObservabilityString(
                        frame.filename.split("/").pop() ?? frame.filename,
                      )
                    : undefined,
                  function: frame.function
                    ? sanitizeObservabilityString(frame.function)
                    : undefined,
                  lineno: frame.lineno,
                  colno: frame.colno,
                })),
              }
            : undefined,
        },
      ],
    };
  }

  return rebuilt;
}

export function createSentryErrorTransport(
  options: SentryAdapterOptions,
): ErrorTransport {
  if (!options.dsn.trim()) {
    throw new Error("Sentry adapter requires a non-empty DSN.");
  }

  let active = true;
  let currentProductErrorCode = "unexpected_error";

  Sentry.init({
    dsn: options.dsn,
    release: options.release,
    environment:
      options.environment ??
      process.env[P_DEV_SENTRY_ENVIRONMENT_ENV]?.trim() ??
      "packaged",
    transport: options.transport,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    enableLogs: false,
    integrations: (defaults) =>
      defaults.filter(
        (integration) =>
          integration.name !== "Http" &&
          integration.name !== "Console" &&
          integration.name !== "OnUncaughtException" &&
          integration.name !== "OnUnhandledRejection",
      ),
    beforeSend(event) {
      if (!active) {
        return null;
      }
      return rebuildApprovedEvent(event, currentProductErrorCode);
    },
    beforeBreadcrumb(breadcrumb) {
      if (!active || breadcrumb.category !== "p-dev") {
        return null;
      }
      return breadcrumb;
    },
  });

  return {
    captureError(input: ProductErrorCaptureInput, context: AllowedSentryContext) {
      if (!active) {
        return;
      }
      currentProductErrorCode = input.productErrorCode;
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
        scope.clear();
        scope.setTags(tags);
        scope.setFingerprint([input.productErrorCode, input.lifecyclePhase]);
        if (input.cause instanceof Error) {
          const sanitized = sanitizeExceptionCause(input.cause);
          const error = new Error(approvedProductErrorMessage(input.productErrorCode));
          error.name = sanitized.type;
          if (sanitized.stack) {
            error.stack = sanitizeStackTrace(sanitized.stack);
          }
          Sentry.captureException(error);
          return;
        }
        Sentry.captureMessage(
          approvedProductErrorMessage(input.productErrorCode),
          "error",
        );
      });
    },
    addBreadcrumb(breadcrumb: TypedBreadcrumb) {
      if (!active) {
        return;
      }
      Sentry.addBreadcrumb({
        category: "p-dev",
        message: breadcrumb.kind,
        data: breadcrumbData(breadcrumb),
        level: "info",
      });
    },
    async flush(deadlineMs: number) {
      if (!active) {
        return;
      }
      await Sentry.flush(deadlineMs);
    },
    async shutdown(options) {
      if (!active) {
        return;
      }
      if (options?.flush !== false) {
        await Sentry.flush(options?.deadlineMs ?? 1_000);
      }
      active = false;
      await Sentry.close(options?.deadlineMs ?? 1_000);
    },
    async disableAndDrop(deadlineMs: number) {
      active = false;
      await Sentry.close(Math.min(deadlineMs, 1_000));
    },
    isActive() {
      return active;
    },
  };
}
