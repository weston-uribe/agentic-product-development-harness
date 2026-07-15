import { NextRequest, NextResponse } from "next/server";
import {
  loadOperationsBootstrap,
  sanitizeBootstrapPayload,
} from "@/lib/operations-server";
import { resolveOperationsSourceContext } from "@harness/operations/source-context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const source = request.nextUrl.searchParams.get("source");
  const fixture = request.nextUrl.searchParams.get("fixture");
  const context = resolveOperationsSourceContext({ source, fixture });
  const payload = sanitizeBootstrapPayload(
    await loadOperationsBootstrap({
      source,
      fixture,
      fixturesEnabled: context.fixturesEnabled,
    }),
  );
  return NextResponse.json(payload);
}
