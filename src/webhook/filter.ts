import { isDispatchTriggerStatus } from "./dispatch-statuses.js";
import type { ParsedLinearIssueWebhook } from "./types.js";

export type FilterResult =
  | { dispatch: true }
  | { dispatch: false; reason: "ignored_event" | "ignored_status" };

export function shouldDispatchLinearIssueEvent(
  event: ParsedLinearIssueWebhook,
): FilterResult {
  if (event.eventType !== "Issue") {
    return { dispatch: false, reason: "ignored_event" };
  }

  if (event.action === "remove") {
    return { dispatch: false, reason: "ignored_event" };
  }

  const passesEventShape = passesStageOneEventShape(event);
  if (!passesEventShape) {
    return { dispatch: false, reason: "ignored_event" };
  }

  if (!isDispatchTriggerStatus(event.statusName)) {
    return { dispatch: false, reason: "ignored_status" };
  }

  return { dispatch: true };
}

function passesStageOneEventShape(event: ParsedLinearIssueWebhook): boolean {
  if (event.action === "update") {
    return event.statusChanged;
  }

  if (event.action === "create") {
    return isDispatchTriggerStatus(event.statusName);
  }

  return false;
}
