import { AppShell } from "@/components/custom/app-shell";
import { ConfigurePageContent } from "@/components/custom/configure-page-content";
import {
  loadRemoteSetupSummary,
  loadSetupFormDefaults,
  loadSetupSummary,
} from "@/lib/setup-server";

export const dynamic = "force-dynamic";

export default async function ConfigurePage() {
  const [summary, formDefaults, remoteSummary] = await Promise.all([
    loadSetupSummary(),
    loadSetupFormDefaults(),
    loadRemoteSetupSummary(),
  ]);

  return (
    <AppShell>
      <ConfigurePageContent
        summary={summary}
        remoteSummary={remoteSummary}
        formDefaults={formDefaults}
      />
    </AppShell>
  );
}
