import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DISPATCH_TRIGGER_STATUSES } from "../../src/webhook/dispatch-statuses.js";
import { shouldDispatchLinearIssueEvent } from "../../src/webhook/filter.js";
import { parseLinearIssueEvent } from "../../src/webhook/parse-linear-issue-event.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/webhook",
);

function parseFixture(name: string) {
  const payload = JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8"));
  const parsed = parseLinearIssueEvent(payload, {
    signature: null,
    deliveryId: "delivery-1",
    eventType: "Issue",
    timestamp: "1700000000000",
  });
  if (!parsed) {
    throw new Error(`Failed to parse fixture ${name}`);
  }
  return parsed;
}

describe("shouldDispatchLinearIssueEvent", () => {
  it("dispatches allowlisted status changes", () => {
    expect(shouldDispatchLinearIssueEvent(parseFixture("issue-ready-for-planning.json"))).toEqual({
      dispatch: true,
    });
    expect(
      shouldDispatchLinearIssueEvent(parseFixture("issue-building-to-pr-open.json")),
    ).toEqual({ dispatch: true });
  });

  it.each(DISPATCH_TRIGGER_STATUSES)("dispatches for trigger status %s on create", (statusName) => {
    const result = shouldDispatchLinearIssueEvent({
      issueKey: "WES-1",
      issueId: "id-1",
      issueUrl: null,
      action: "create",
      statusName,
      previousStatusName: null,
      statusChanged: false,
      linearDeliveryId: null,
      linearWebhookId: null,
      actorSummary: null,
      eventType: "Issue",
    });
    expect(result).toEqual({ dispatch: true });
  });

  it.each([
    "Backlog",
    "Planning",
    "Building",
    "PM Review",
    "Revising",
    "Merging",
    "Merged to Dev",
    "Merged / Deployed",
    "Blocked",
    "Canceled",
    "Duplicate",
    "Unknown Status",
  ])("ignores non-trigger status %s", (statusName) => {
    const result = shouldDispatchLinearIssueEvent({
      issueKey: "WES-1",
      issueId: "id-1",
      issueUrl: null,
      action: "update",
      statusName,
      previousStatusName: "Backlog",
      statusChanged: true,
      linearDeliveryId: null,
      linearWebhookId: null,
      actorSummary: null,
      eventType: "Issue",
    });
    expect(result).toEqual({ dispatch: false, reason: "ignored_status" });
  });

  it("returns ignored_status for PM Review handoff transition", () => {
    expect(shouldDispatchLinearIssueEvent(parseFixture("issue-pm-review.json"))).toEqual({
      dispatch: false,
      reason: "ignored_status",
    });
  });

  it("returns ignored_event for title-only updates", () => {
    expect(shouldDispatchLinearIssueEvent(parseFixture("issue-title-only-update.json"))).toEqual({
      dispatch: false,
      reason: "ignored_event",
    });
  });

  it("returns ignored_event for non-Issue events", () => {
    const result = shouldDispatchLinearIssueEvent({
      issueKey: "WES-1",
      issueId: "id-1",
      issueUrl: null,
      action: "create",
      statusName: "Ready for Planning",
      previousStatusName: null,
      statusChanged: false,
      linearDeliveryId: null,
      linearWebhookId: null,
      actorSummary: null,
      eventType: "Comment",
    });
    expect(result).toEqual({ dispatch: false, reason: "ignored_event" });
  });

  it("returns ignored_event for remove actions", () => {
    const result = shouldDispatchLinearIssueEvent({
      issueKey: "WES-1",
      issueId: "id-1",
      issueUrl: null,
      action: "remove",
      statusName: "Ready for Planning",
      previousStatusName: null,
      statusChanged: true,
      linearDeliveryId: null,
      linearWebhookId: null,
      actorSummary: null,
      eventType: "Issue",
    });
    expect(result).toEqual({ dispatch: false, reason: "ignored_event" });
  });
});
