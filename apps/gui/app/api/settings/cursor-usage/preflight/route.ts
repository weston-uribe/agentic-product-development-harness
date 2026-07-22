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
  const boundsSource = String(formData.get("boundsSource") ?? "csv_row_extrema").trim();
  const exportStart = String(formData.get("exportStart") ?? "").trim();
  const exportEnd = String(formData.get("exportEnd") ?? "").trim();
  const exportTimezone = String(formData.get("timezone") ?? "UTC").trim();
  const assumedTimezone = String(formData.get("assumedTimezone") ?? "").trim();
  const disambiguation = String(formData.get("disambiguation") ?? "").trim();
  const expectedSourceDigestSha256 = String(
    formData.get("expectedSourceDigestSha256") ?? "",
  ).trim();
  const expectedInspectionToken = String(
    formData.get("expectedInspectionToken") ?? "",
  ).trim();
  const advancedOverride =
    String(formData.get("advancedOverride") ?? "") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "CSV filename required." },
      { status: 400 },
    );
  }
  if (file.size > CURSOR_USAGE_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const useManual =
    advancedOverride && boundsSource === "operator_gui_fields";
  if (useManual && (!exportStart || !exportEnd)) {
    return NextResponse.json(
      { error: "Export window start and end are required for manual override." },
      { status: 400 },
    );
  }

  const csvBytes = Buffer.from(await file.arrayBuffer());
  try {
    const result = await runPreflightCsvImport({
      csvBytes,
      exportWindow: useManual
        ? buildExportWindow({
            exportStart,
            exportEnd,
            exportTimezone,
          })
        : {
            startIso: "",
            endIso: "",
            timezone: "UTC",
            precision: "millisecond",
            boundsSource: "csv_row_extrema",
          },
      assumedTimezone: assumedTimezone || null,
      disambiguationPolicy:
        disambiguation === "earlier" || disambiguation === "later"
          ? disambiguation
          : "reject_ambiguous",
      expectedSourceDigestSha256: expectedSourceDigestSha256 || null,
      expectedInspectionToken: expectedInspectionToken || null,
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
    const message =
      error instanceof Error ? error.message : "Preflight import failed.";
    if (
      message === "inspection_digest_mismatch" ||
      message === "inspection_token_mismatch" ||
      message === "export_window_unproven" ||
      message === "invalid_assumed_timezone" ||
      message.startsWith("Missing required CSV column")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
