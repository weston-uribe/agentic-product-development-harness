import { NextRequest, NextResponse } from "next/server";
import { captureAnalyticsEvent } from "@harness/observability/facade.js";
import type {
  AnalyticsEvent,
  CompletionOutcome,
  DurationBucket,
} from "@harness/observability/types.js";
import { guardObservabilityRequest } from "@/lib/observability-request-guard";

export const dynamic = "force-dynamic";

function parseAnalyticsEvent(body: Record<string, unknown>): AnalyticsEvent {
  const type = body.type;
  if (typeof type !== "string") {
    throw new Error("Event type is required.");
  }

  switch (type) {
    case "p_dev_configure_step_viewed":
      return {
        type,
        stepId: String(body.stepId ?? ""),
        stepNumber: Number(body.stepNumber ?? 0),
        resumed: body.resumed === true,
        revisited: body.revisited === true,
      };
    case "p_dev_configure_step_completed":
      return {
        type,
        stepId: String(body.stepId ?? ""),
        stepNumber: Number(body.stepNumber ?? 0),
        resumed: body.resumed === true,
        revisited: body.revisited === true,
        durationBucket: String(body.durationBucket ?? "unknown") as DurationBucket,
        completionOutcome: String(
          body.completionOutcome ?? "unknown",
        ) as CompletionOutcome,
      };
    case "p_dev_setup_completed":
      return { type };
    default:
      throw new Error(`Unsupported client analytics event: ${type}`);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await guardObservabilityRequest(request);
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const body = guard.body as Record<string, unknown>;
    const event = parseAnalyticsEvent(body);
    captureAnalyticsEvent(event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid analytics event.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
