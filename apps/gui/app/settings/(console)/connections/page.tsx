import { loadSettingsOverview } from "@/lib/settings/load-settings-overview";
import { SettingsSummarySection } from "@/components/settings/settings-summary-section";

export const dynamic = "force-dynamic";

export default async function SettingsConnectionsPage() {
  const overview = await loadSettingsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Connections</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Credential presence from local environment files. Values are never displayed.
        </p>
      </div>
      <SettingsSummarySection
        title="API credentials"
        description="Post-setup credential replacement is available in a future settings update."
        rows={[
          { label: "Linear API key", value: overview.credentials.linear },
          { label: "Cursor API key", value: overview.credentials.cursor },
          { label: "GitHub token", value: overview.credentials.github },
          { label: "Vercel token", value: overview.credentials.vercel },
        ]}
      />
    </div>
  );
}
