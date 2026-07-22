import { NextRequest, NextResponse } from "next/server";
import {
  CURSOR_USAGE_UPLOAD_MAX_BYTES,
  guardCursorUsageMultipartUpload,
} from "@/lib/cursor-usage-request-guard";
import {
  buildExportWindow,
  runPreflightCsvImport,
} from "@/lib/cursor-usage-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await guardCursorUsageMultipartUpload(request);
  if (!guard.ok) {
    return guard.response;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form." }, { status: 400 });
  }

  const file = formData.get("file");
  const exportStart = String(formData.get("exportStart") ?? "").trim();
  const exportEnd = String(formData.get("exportEnd") ?? "").trim();
  const exportTimezone = String(formData.get("timezone") ?? "UTC").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }
  if (!exportStart || !exportEnd) {
    return NextResponse.json(
      { error: "Export window start and end are required." },
      { status: 400 },
    );
  }
  if (file.size > CURSOR_USAGE_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const csvBytes = Buffer.from(await file.arrayBuffer());
  try {
    const result = await runPreflightCsvImport({
      csvBytes,
      exportWindow: buildExportWindow({
        exportStart,
        exportEnd,
        exportTimezone,
      }),
    });
    return NextResponse.json({
      importId: result.importId,
      fingerprint: result.fingerprint,
      preflightApprovalFingerprint: result.preflightApprovalFingerprint,
      lifecycle: result.lifecycle,
      sourceScopeComplete: result.sourceScopeComplete,
      sourceScopeIncompleteReason:
        result.publicSummary.sourceScopeIncompleteReason ?? null,
      bundleCount: result.bundleCount,
      publicSummary: result.publicSummary,
      rows: result.rows,
      conflicts: result.conflicts,
      uploadScopedRejectionCount:
        result.publicSummary.uploadScopedRejectionCount,
      agentScopedRejectionCount: result.publicSummary.agentScopedRejectionCount,
      rejectionReasonCodes: result.publicSummary.rejectionReasonCodes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Preflight import failed.",
      },
      { status: 500 },
    );
  }
}
