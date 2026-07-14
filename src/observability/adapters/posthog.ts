import { PostHog } from "posthog-node";
import type {
  AnalyticsTransport,
  SerializedAnalyticsEvent,
  TransportShutdownOptions,
} from "../types.js";

export interface PostHogAdapterOptions {
  projectToken: string;
  host: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  onRequestInitiated?: (timestamp: number) => void;
  onRequestCompleted?: (timestamp: number) => void;
}

export function createPostHogAnalyticsTransport(
  options: PostHogAdapterOptions,
): AnalyticsTransport {
  if (!options.projectToken.trim()) {
    throw new Error("PostHog adapter requires a non-empty project token.");
  }

  const host = options.host.replace(/\/$/, "");
  const inFlight = new Set<Promise<void>>();
  let active = true;
  let client: PostHog | null = new PostHog(options.projectToken, {
    host,
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: true,
    disableCompression: true,
    persistence: "memory",
    fetch: options.fetchImpl
      ? async (url, fetchOptions) => {
          const response = await options.fetchImpl!(url, fetchOptions);
          return {
            status: response.status,
            text: async () => response.text(),
            json: async () => response.json(),
          };
        }
      : undefined,
  });

  async function deliver(event: SerializedAnalyticsEvent): Promise<void> {
    if (!active || !client) {
      return;
    }
    const initiatedAt = Date.now();
    options.onRequestInitiated?.(initiatedAt);
    try {
      await client.captureImmediate({
        distinctId: String(event.properties.distinct_id ?? "unknown"),
        event: event.event,
        properties: {
          ...event.properties,
          $process_person_profile: false,
        },
        disableGeoip: true,
      });
      options.onRequestCompleted?.(Date.now());
    } catch {
      // best-effort transport
    }
  }

  return {
    capture(event: SerializedAnalyticsEvent) {
      if (!active || !client) {
        return;
      }
      const operation = deliver(event).finally(() => {
        inFlight.delete(operation);
      });
      inFlight.add(operation);
    },
    async flush(deadlineMs: number) {
      const started = Date.now();
      while (inFlight.size > 0 && Date.now() - started < deadlineMs) {
        await Promise.allSettled([...inFlight]);
        if (inFlight.size === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    async shutdown(options?: TransportShutdownOptions) {
      active = false;
      const deadlineMs = options?.deadlineMs ?? 2_000;
      if (options?.flush !== false) {
        await this.flush(deadlineMs);
      }
      if (client) {
        await client._shutdown(deadlineMs);
        client = null;
      }
      await Promise.allSettled([...inFlight]);
    },
    async disableAndDrop(deadlineMs: number) {
      active = false;
      if (client) {
        client = null;
      }
      const started = Date.now();
      while (inFlight.size > 0 && Date.now() - started < deadlineMs) {
        await Promise.allSettled([...inFlight]);
        if (inFlight.size === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    isActive() {
      return active;
    },
  };
}
