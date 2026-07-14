import { AppShell } from "@/components/custom/app-shell";
import { ConfigurePageContent } from "@/components/custom/configure-page-content";
import {
  loadLinearSetupSummary,
  loadRemoteSetupSummary,
  loadSetupFormDefaults,
  loadSetupSummary,
  loadVercelSetupSummary,
} from "@/lib/setup-server";
import { P_DEV_OBSERVABILITY_NONCE_ENV } from "@harness/observability/constants.js";

export const dynamic = "force-dynamic";

export default async function ConfigurePage() {
  const [summary, formDefaults, remoteSummary, linearSummary, vercelSummary] =
    await Promise.all([
      loadSetupSummary(),
      loadSetupFormDefaults(),
      loadRemoteSetupSummary(),
      loadLinearSetupSummary(),
      loadVercelSetupSummary(),
    ]);

  const observabilityNonce =
    process.env[P_DEV_OBSERVABILITY_NONCE_ENV]?.trim() ?? null;

  return (
    <AppShell>
      <ConfigurePageContent
        summary={summary}
        remoteSummary={remoteSummary}
        linearSummary={linearSummary}
        vercelSummary={vercelSummary}
        formDefaults={formDefaults}
        observabilityNonce={observabilityNonce}
      />
    </AppShell>
  );
}
