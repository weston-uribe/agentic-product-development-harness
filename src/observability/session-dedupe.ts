import type { AnalyticsEvent } from "./types.js";

const emittedKeys = new Set<string>();

function dedupeKey(sessionId: string, suffix: string): string {
  return `${sessionId}:${suffix}`;
}

export function analyticsEventDedupeSuffix(
  event: AnalyticsEvent,
  operationId?: string,
): string {
  switch (event.type) {
    case "p_dev_session_started":
      return "session_started";
    case "p_dev_configure_step_viewed":
      return `step_viewed:${event.stepId}`;
    case "p_dev_configure_step_completed":
      return `step_completed:${event.stepId}`;
    case "p_dev_setup_completed":
      return "setup_completed";
    case "p_dev_workspace_provision_started":
      return `provision_started:${operationId ?? "unknown"}`;
    case "p_dev_workspace_provision_completed":
      return `provision_completed:${operationId ?? "unknown"}`;
    case "p_dev_workspace_provision_failed":
      return `provision_failed:${operationId ?? "unknown"}`;
    default: {
      const exhaustive: never = event;
      return String(exhaustive);
    }
  }
}

export function hasAnalyticsEventBeenEmitted(
  sessionId: string,
  suffix: string,
): boolean {
  return emittedKeys.has(dedupeKey(sessionId, suffix));
}

export function markAnalyticsEventEmitted(
  sessionId: string,
  suffix: string,
): void {
  emittedKeys.add(dedupeKey(sessionId, suffix));
}

export function shouldDedupeAnalyticsEvent(
  sessionId: string,
  event: AnalyticsEvent,
  operationId?: string,
): boolean {
  return hasAnalyticsEventBeenEmitted(
    sessionId,
    analyticsEventDedupeSuffix(event, operationId),
  );
}

export function recordAnalyticsEventEmission(
  sessionId: string,
  event: AnalyticsEvent,
  operationId?: string,
): void {
  markAnalyticsEventEmitted(
    sessionId,
    analyticsEventDedupeSuffix(event, operationId),
  );
}

export function resetAnalyticsSessionDedupeForTests(): void {
  emittedKeys.clear();
}
