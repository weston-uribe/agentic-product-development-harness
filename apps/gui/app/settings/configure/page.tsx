import { AppShell } from "@/components/custom/app-shell";
import { ConfigurePageContent } from "@/components/custom/configure-page-content";
import { loadSetupSummary } from "@/lib/setup-server";

export const dynamic = "force-dynamic";

export default async function ConfigurePage() {
  const summary = await loadSetupSummary();

  return (
    <AppShell>
      <ConfigurePageContent summary={summary} />
    </AppShell>
  );
}
