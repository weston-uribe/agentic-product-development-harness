import type { AnalyticsTransport, ErrorTransport } from "../types.js";

export function createNoopAnalyticsTransport(): AnalyticsTransport {
  return {
    capture() {
      // no-op
    },
    async flush() {
      // no-op
    },
    async shutdown() {
      // no-op
    },
  };
}

export function createNoopErrorTransport(): ErrorTransport {
  return {
    captureError() {
      // no-op
    },
    addBreadcrumb() {
      // no-op
    },
    async flush() {
      // no-op
    },
    async shutdown() {
      // no-op
    },
  };
}
