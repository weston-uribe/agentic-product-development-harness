"use client";

import type { AnalyticsEvent } from "@harness/observability/types.js";

type ClientAnalyticsEvent = Extract<
  AnalyticsEvent,
  | { type: "p_dev_configure_step_viewed" }
  | { type: "p_dev_configure_step_completed" }
  | { type: "p_dev_setup_completed" }
>;

export async function postObservabilityAnalyticsEvent(
  event: ClientAnalyticsEvent,
  nonce: string,
): Promise<void> {
  const response = await fetch("/api/observability/event", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-p-dev-observability-nonce": nonce,
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    return;
  }
}
