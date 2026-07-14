import { NextRequest, NextResponse } from "next/server";
import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";
import {
  readObservabilityPreferences,
  resetObservabilityState,
  writeObservabilityPreferences,
} from "@harness/observability/facade.js";
import type { ConsentPreference } from "@harness/observability/types.js";
import { guardObservabilityRequest } from "@/lib/observability-request-guard";

export const dynamic = "force-dynamic";

function normalizePreference(value: unknown): ConsentPreference | undefined {
  if (value === "enabled" || value === "disabled" || value === null) {
    return value;
  }
  return undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await guardObservabilityRequest(request);
  if (!guard.ok) {
    return guard.response;
  }

  const workspaceDir = resolveHarnessRepoRoot();
  const state = await readObservabilityPreferences(workspaceDir);
  return NextResponse.json({
    analyticsPreference: state.analyticsPreference,
    errorReportingPreference: state.errorReportingPreference,
    disclosureShown: state.disclosureShown,
    hasInstallationId: Boolean(state.installationId),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await guardObservabilityRequest(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = guard.body as Record<string, unknown>;
  const workspaceDir = resolveHarnessRepoRoot();

  if (body.reset === true) {
    await resetObservabilityState(workspaceDir);
    const state = await readObservabilityPreferences(workspaceDir);
    return NextResponse.json({
      analyticsPreference: state.analyticsPreference,
      errorReportingPreference: state.errorReportingPreference,
      disclosureShown: state.disclosureShown,
      hasInstallationId: Boolean(state.installationId),
    });
  }

  const analyticsPreference = normalizePreference(body.analyticsPreference);
  const errorReportingPreference = normalizePreference(
    body.errorReportingPreference,
  );
  const disclosureShown =
    typeof body.disclosureShown === "boolean" ? body.disclosureShown : undefined;

  const state = await writeObservabilityPreferences(workspaceDir, {
    analyticsPreference,
    errorReportingPreference,
    disclosureShown,
  });

  const persisted = state?.localState ?? (await readObservabilityPreferences(workspaceDir));
  return NextResponse.json({
    analyticsPreference: persisted.analyticsPreference,
    errorReportingPreference: persisted.errorReportingPreference,
    disclosureShown: persisted.disclosureShown,
    hasInstallationId: Boolean(persisted.installationId),
  });
}
