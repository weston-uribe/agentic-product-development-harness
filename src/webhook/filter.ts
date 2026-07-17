import { isDispatchTriggerStatus } from "./dispatch-statuses.js";
import type { HarnessConfig } from "../config/types.js";
import { runLinearAssociationGate } from "../config/linear-association-gate.js";
import type { ParsedLinearIssueWebhook } from "./types.js";

export type FilterResult =
  | { dispatch: true }
  | {
      dispatch: false;
      reason:
        | "ignored_event"
        | "ignored_status"
        | "linear_team_project_not_configured";
    };

export function shouldDispatchLinearIssueEvent(
  event: ParsedLinearIssueWebhook,
  options?: { config?: HarnessConfig },
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

  if (options?.config) {
    const associationGate = runLinearAssociationGate({
      config: options.config,
      teamId: event.teamId,
      projectId: event.projectId,
    });
    if (!associationGate.ok) {
      return {
        dispatch: false,
        reason: "linear_team_project_not_configured",
      };
    }
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
