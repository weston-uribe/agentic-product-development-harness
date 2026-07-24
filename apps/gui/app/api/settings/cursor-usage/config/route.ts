import { NextRequest, NextResponse } from "next/server";
import { guardCursorUsageGet } from "@/lib/cursor-usage-request-guard";
import { resolveCursorUsageServerContext } from "@/lib/cursor-usage-server";
import { resolveProvenanceCoveragePublicStatus } from "@harness/evaluation/cursor-usage-import/provenance-scope/coverage-status.js";
import { createOperatorCoverageContext } from "@harness/provenance/operator-coverage.js";
import { inspectAuthoritativeEpochCoverage } from "@harness/provenance/authoritative-coverage-inspect.js";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await guardCursorUsageGet(request);
  if (!guard.ok) {
    return guard.response;
  }

  const ctx = await resolveCursorUsageServerContext();
  const d = ctx.discovery;
  let authoritativeStatus: string | null = null;
  const epochId = process.env.P_DEV_PROVENANCE_ACTIVE_EPOCH_ID?.trim() || null;
  if (epochId) {
    try {
      const op = createOperatorCoverageContext({ env: process.env });
      const inspection = await inspectAuthoritativeEpochCoverage(op as any, {
        epochId,
      });
      authoritativeStatus = inspection.status;
    } catch {
      authoritativeStatus = null;
    }
  }
  const provenanceCoverage = resolveProvenanceCoveragePublicStatus(process.env, {
    authoritativeStatus: authoritativeStatus as any,
  });
  return NextResponse.json({
    langfuseConfigured: d.langfuseConfigured,
    configurationStatus: d.configurationStatus,
    providerConfigured: d.providerConfigured,
    credentialsConfigured: d.credentialsConfigured,
    namespaceConfigured: d.namespaceConfigured,
    namespace: d.namespace,
    environment: d.environmentFilter,
    environmentFilterExplicit: d.environmentFilterExplicit,
    langfuseHost: d.langfuseHost,
    errorCode: d.errorCode,
    errorMessage: d.errorMessage,
    adminKeyConfigured: ctx.adminKeyConfigured,
    provenanceCoverage,
  });
}
