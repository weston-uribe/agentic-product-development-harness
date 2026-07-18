import {
  dispatchRepositoryEvent,
  getDispatchEventType,
  getDispatchRepository,
} from "./dispatch-github.js";
import { loadHarnessConfig } from "../config/load-config.js";
import {
  shouldDispatchLinearCommentEvent,
  shouldDispatchLinearIssueEvent,
} from "./filter.js";
import { parseLinearCommentEvent } from "./parse-linear-comment-event.js";
import {
  parseLinearIssueEvent,
  readWebhookHeaders,
} from "./parse-linear-issue-event.js";
import { logWebhookEvent } from "./redact-log.js";
import type {
  RepositoryDispatchPayload,
  WebhookAcceptedResponse,
  WebhookErrorResponse,
  WebhookIgnoredResponse,
} from "./types.js";
import {
  parseTimestampMs,
  verifyLinearSignature,
  verifyWebhookTimestamp,
} from "./verify.js";

export interface HandleLinearWebhookOptions {
  method: string;
  rawBody: string;
  headerGetter: (name: string) => string | null;
  webhookSecret?: string;
  dispatchToken?: string;
  teamKey?: string | null;
  toleranceMs?: number;
  nowMs?: number;
  fetchImpl?: typeof fetch;
}

type WebhookResponseBody =
  | WebhookAcceptedResponse
  | WebhookIgnoredResponse
  | WebhookErrorResponse;

export interface HandleLinearWebhookResult {
  status: number;
  body: WebhookResponseBody;
}

function jsonResponse(
  status: number,
  body: WebhookResponseBody,
): HandleLinearWebhookResult {
  return { status, body };
}

async function loadHarnessConfigForWebhook() {
  try {
    const loaded = await loadHarnessConfig({
      configPath: process.env.HARNESS_CONFIG_PATH,
    });
    return loaded.config;
  } catch {
    return undefined;
  }
}

function readPayloadEventType(
  payload: unknown,
  headersEventType: string | null,
): string {
  if (headersEventType?.trim()) {
    return headersEventType.trim();
  }
  if (payload && typeof payload === "object") {
    const type = (payload as { type?: unknown }).type;
    if (typeof type === "string") {
      return type;
    }
  }
  return "";
}

export async function handleLinearWebhook(
  options: HandleLinearWebhookOptions,
): Promise<HandleLinearWebhookResult> {
  if (options.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const webhookSecret = options.webhookSecret ?? process.env.LINEAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return jsonResponse(500, { error: "dispatch_failed" });
  }

  const headers = readWebhookHeaders(options.headerGetter);
  const signatureOk = verifyLinearSignature({
    secret: webhookSecret,
    rawBody: options.rawBody,
    signatureHeader: headers.signature,
  });

  if (!signatureOk) {
    logWebhookEvent({ accepted: false, error: "invalid_signature" });
    return jsonResponse(401, { error: "invalid_signature" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(options.rawBody) as unknown;
  } catch {
    logWebhookEvent({ accepted: false, error: "invalid_signature" });
    return jsonResponse(401, { error: "invalid_signature" });
  }

  const payloadRecord = payload as { webhookTimestamp?: unknown };
  const toleranceMs =
    options.toleranceMs ??
    Number(process.env.LINEAR_WEBHOOK_TIMESTAMP_TOLERANCE_MS ?? 60_000);

  const timestampOk = verifyWebhookTimestamp({
    webhookTimestampMs: parseTimestampMs(payloadRecord.webhookTimestamp),
    headerTimestampMs: parseTimestampMs(headers.timestamp),
    toleranceMs,
    nowMs: options.nowMs,
  });

  if (!timestampOk) {
    logWebhookEvent({ accepted: false, error: "timestamp_out_of_tolerance" });
    return jsonResponse(401, { error: "timestamp_out_of_tolerance" });
  }

  const teamKey =
    options.teamKey ?? process.env.HARNESS_TEAM_KEY ?? null;
  const eventType = readPayloadEventType(payload, headers.eventType);
  const config = await loadHarnessConfigForWebhook();

  let clientPayload: RepositoryDispatchPayload | null = null;

  if (eventType === "Comment") {
    const parsed = parseLinearCommentEvent(payload, headers, teamKey);
    if (!parsed) {
      logWebhookEvent({ accepted: false, reason: "ignored_event" });
      return jsonResponse(200, { accepted: false, reason: "ignored_event" });
    }

    const filterResult = shouldDispatchLinearCommentEvent(parsed, {
      config,
      orchestratorMarker: config?.orchestratorMarker,
    });
    if (!filterResult.dispatch) {
      logWebhookEvent({
        linearDeliveryId: parsed.linearDeliveryId,
        linearWebhookId: parsed.linearWebhookId,
        issueKey: parsed.issueKey,
        action: parsed.action,
        accepted: false,
        reason: filterResult.reason,
      });
      return jsonResponse(200, {
        accepted: false,
        reason: filterResult.reason,
      });
    }

    if (!parsed.issueKey) {
      logWebhookEvent({
        linearDeliveryId: parsed.linearDeliveryId,
        linearWebhookId: parsed.linearWebhookId,
        action: parsed.action,
        accepted: false,
        reason: "missing_issue_key",
      });
      return jsonResponse(200, {
        accepted: false,
        reason: "missing_issue_key",
      });
    }

    clientPayload = {
      issueKey: parsed.issueKey,
      issueId: parsed.issueId,
      issueUrl: null,
      action: parsed.action,
      statusName: null,
      previousStatusName: null,
      linearDeliveryId: parsed.linearDeliveryId,
      linearWebhookId: parsed.linearWebhookId,
      receivedAt: new Date(options.nowMs ?? Date.now()).toISOString(),
      meta: {
        triggerKind: "comment_create",
        commentId: parsed.commentId,
      },
    };
  } else {
    const parsed = parseLinearIssueEvent(payload, headers, teamKey);

    if (!parsed) {
      logWebhookEvent({ accepted: false, reason: "ignored_event" });
      return jsonResponse(200, { accepted: false, reason: "ignored_event" });
    }

    const filterResult = shouldDispatchLinearIssueEvent(parsed, {
      config,
    });
    if (!filterResult.dispatch) {
      logWebhookEvent({
        linearDeliveryId: parsed.linearDeliveryId,
        linearWebhookId: parsed.linearWebhookId,
        issueKey: parsed.issueKey,
        action: parsed.action,
        statusName: parsed.statusName,
        previousStatusName: parsed.previousStatusName,
        accepted: false,
        reason: filterResult.reason,
      });
      return jsonResponse(200, {
        accepted: false,
        reason: filterResult.reason,
      });
    }

    if (!parsed.issueKey) {
      logWebhookEvent({
        linearDeliveryId: parsed.linearDeliveryId,
        linearWebhookId: parsed.linearWebhookId,
        action: parsed.action,
        statusName: parsed.statusName,
        accepted: false,
        reason: "missing_issue_key",
      });
      return jsonResponse(200, {
        accepted: false,
        reason: "missing_issue_key",
      });
    }

    clientPayload = {
      issueKey: parsed.issueKey,
      issueId: parsed.issueId,
      issueUrl: parsed.issueUrl,
      action: parsed.action,
      statusName: parsed.statusName,
      previousStatusName: parsed.previousStatusName,
      linearDeliveryId: parsed.linearDeliveryId,
      linearWebhookId: parsed.linearWebhookId,
      receivedAt: new Date(options.nowMs ?? Date.now()).toISOString(),
      meta: {
        triggerKind: "issue_status",
      },
    };
  }

  const dispatchToken =
    options.dispatchToken ?? process.env.GITHUB_DISPATCH_TOKEN;
  if (!dispatchToken) {
    logWebhookEvent({
      issueKey: clientPayload.issueKey,
      accepted: false,
      error: "dispatch_failed",
    });
    return jsonResponse(500, { error: "dispatch_failed" });
  }

  try {
    await dispatchRepositoryEvent({
      token: dispatchToken,
      repository: getDispatchRepository(),
      eventType: getDispatchEventType(),
      clientPayload,
      fetchImpl: options.fetchImpl,
    });
  } catch (error) {
    logWebhookEvent({
      issueKey: clientPayload.issueKey,
      accepted: false,
      error: "dispatch_failed",
      reason: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(500, { error: "dispatch_failed" });
  }

  logWebhookEvent({
    linearDeliveryId: clientPayload.linearDeliveryId,
    linearWebhookId: clientPayload.linearWebhookId,
    issueKey: clientPayload.issueKey,
    action: clientPayload.action,
    statusName: clientPayload.statusName,
    previousStatusName: clientPayload.previousStatusName,
    accepted: true,
    dispatched: true,
  });

  return jsonResponse(200, {
    accepted: true,
    dispatched: true,
    issueKey: clientPayload.issueKey,
  });
}
