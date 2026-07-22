import { NextRequest, NextResponse } from "next/server";
import { guardCursorUsageJsonApply } from "@/lib/cursor-usage-request-guard";
import { runApplyCsvImport } from "@/lib/cursor-usage-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await guardCursorUsageJsonApply(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = guard.body as Record<string, unknown>;
  const importId = String(body.importId ?? "").trim();
  const fingerprint = String(body.fingerprint ?? "").trim();
  const preflightApprovalFingerprint = String(
    body.preflightApprovalFingerprint ?? body.fingerprint ?? "",
  ).trim();
  if (!importId || !fingerprint) {
    return NextResponse.json(
      { error: "importId and fingerprint are required." },
      { status: 400 },
    );
  }

  try {
    const result = await runApplyCsvImport({
      importId,
      fingerprint,
      preflightApprovalFingerprint,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Apply import failed.";
    const status =
      message.startsWith("source_scope_incomplete") ||
      message.startsWith("preflight_plan_changed") ||
      message.startsWith("import_lifecycle_not_applicable")
        ? 409
        : message.includes("conflict")
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
