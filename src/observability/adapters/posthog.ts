import type {
  AnalyticsTransport,
  SerializedAnalyticsEvent,
} from "../types.js";
import { OBSERVABILITY_MAX_QUEUE_SIZE } from "../constants.js";

export interface PostHogAdapterOptions {
  projectToken: string;
  host: string;
  requestTimeoutMs?: number;
}

interface QueuedEvent {
  body: string;
}

export function createPostHogAnalyticsTransport(
  options: PostHogAdapterOptions,
): AnalyticsTransport {
  if (!options.projectToken.trim()) {
    throw new Error("PostHog adapter requires a non-empty project token.");
  }

  const host = options.host.replace(/\/$/, "");
  const queue: QueuedEvent[] = [];
  const requestTimeoutMs = options.requestTimeoutMs ?? 2_000;

  async function send(body: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      await fetch(`${host}/capture/`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body,
        signal: controller.signal,
      });
    } catch {
      // best-effort transport
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    capture(event: SerializedAnalyticsEvent) {
      if (queue.length >= OBSERVABILITY_MAX_QUEUE_SIZE) {
        queue.shift();
      }
      queue.push({
        body: JSON.stringify({
          api_key: options.projectToken,
          event: event.event,
          distinct_id: event.properties.distinct_id,
          properties: event.properties,
        }),
      });
    },
    async flush(deadlineMs: number) {
      const started = Date.now();
      while (queue.length > 0 && Date.now() - started < deadlineMs) {
        const next = queue.shift();
        if (!next) {
          break;
        }
        await send(next.body);
      }
    },
    async shutdown() {
      await this.flush(1_000);
    },
  };
}
