import { AppShell } from "@/components/custom/app-shell";
import { ConfigurePageContent } from "@/components/custom/configure-page-content";
import {
  loadLinearSetupSummary,
  loadRemoteSetupSummary,
  loadSetupFormDefaults,
  loadSetupSummary,
  loadVercelSetupSummary,
} from "@/lib/setup-server";
import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";
import { readObservabilityPreferences } from "@harness/observability/facade.js";
import { P_DEV_OBSERVABILITY_NONCE_ENV } from "@harness/observability/constants.js";

export const dynamic = "force-dynamic";

export default async function ConfigurePage() {
  const workspaceDir = resolveHarnessWorkspaceDir();
  const [summary, formDefaults, remoteSummary, linearSummary, vercelSummary, observabilityState] =
    await Promise.all([
      loadSetupSummary(),
      loadSetupFormDefaults(),
      loadRemoteSetupSummary(),
      loadLinearSetupSummary(),
      loadVercelSetupSummary(),
      readObservabilityPreferences(workspaceDir),
    ]);

  const observabilityNonce =
    process.env[P_DEV_OBSERVABILITY_NONCE_ENV]?.trim() ?? null;

  return (
    <AppShell isConfigureActive>
      <ConfigurePageContent
        summary={summary}
        remoteSummary={remoteSummary}
        linearSummary={linearSummary}
        vercelSummary={vercelSummary}
        formDefaults={formDefaults}
        observabilityNonce={observabilityNonce}
        observabilityPreferences={{
          analyticsPreference: observabilityState.analyticsPreference,
          errorReportingPreference: observabilityState.errorReportingPreference,
          disclosureShown: observabilityState.disclosureShown,
        }}
      />
    </AppShell>
  );
}
