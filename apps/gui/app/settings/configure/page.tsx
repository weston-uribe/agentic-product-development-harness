import { AppShell } from "@/components/custom/app-shell";
import { ConfigurePageContent } from "@/components/custom/configure-page-content";
import { loadSetupFormDefaults, loadSetupSummary } from "@/lib/setup-server";

export const dynamic = "force-dynamic";

export default async function ConfigurePage() {
  const [summary, formDefaults] = await Promise.all([
    loadSetupSummary(),
    loadSetupFormDefaults(),
  ]);

  return (
    <AppShell>
      <ConfigurePageContent summary={summary} formDefaults={formDefaults} />
    </AppShell>
  );
}
