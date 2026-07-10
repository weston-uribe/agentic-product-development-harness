import { AppShell } from "@/components/custom/app-shell";
import { ConfigurePageContent } from "@/components/custom/configure-page-content";
import {
  loadLinearSetupSummary,
  loadRemoteSetupSummary,
  loadSetupFormDefaults,
  loadSetupSummary,
  loadVercelSetupSummary,
} from "@/lib/setup-server";

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

  return (
    <AppShell>
      <ConfigurePageContent
        summary={summary}
        remoteSummary={remoteSummary}
        linearSummary={linearSummary}
        vercelSummary={vercelSummary}
        formDefaults={formDefaults}
      />
    </AppShell>
  );
}
