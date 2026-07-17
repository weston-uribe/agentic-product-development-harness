import { loadSettingsOverview } from "@/lib/settings/load-settings-overview";
import { SettingsSummarySection } from "@/components/settings/settings-summary-section";

export const dynamic = "force-dynamic";

export default async function SettingsAdvancedPage() {
  const overview = await loadSettingsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Advanced</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Local configuration fingerprints and sync metadata.
        </p>
      </div>
      <SettingsSummarySection
        title="Configuration"
        description="Advanced editors are planned for a later settings update."
        rows={[
          {
            label: "Config fingerprint",
            value: overview.configFingerprint ?? "Unavailable",
          },
          {
            label: "Harness dispatch repo",
            value: overview.harnessDispatchRepo || "Not configured",
          },
        ]}
      />
    </div>
  );
}
