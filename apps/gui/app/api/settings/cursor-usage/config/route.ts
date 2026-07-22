import { NextRequest, NextResponse } from "next/server";
import { guardCursorUsageGet } from "@/lib/cursor-usage-request-guard";
import { resolveCursorUsageServerContext } from "@/lib/cursor-usage-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await guardCursorUsageGet(request);
  if (!guard.ok) {
    return guard.response;
  }

  const ctx = await resolveCursorUsageServerContext();
  return NextResponse.json({
    namespace: ctx.namespace,
    environment: ctx.environment,
    adminKeyConfigured: ctx.adminKeyConfigured,
  });
}
