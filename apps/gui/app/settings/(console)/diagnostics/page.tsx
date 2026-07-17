import { SettingsDiagnosticsClient } from "@/components/settings/settings-diagnostics-client";
import { loadSetupSummary } from "@/lib/setup-server";

export const dynamic = "force-dynamic";

export default async function SettingsDiagnosticsPage() {
  const summary = await loadSetupSummary();

  return (
    <SettingsDiagnosticsClient
      initialDoctor={summary.doctor}
      lastCheckedAt={null}
    />
  );
}
