import { loadSettingsOverview } from "@/lib/settings/load-settings-overview";
import { SettingsSummarySection } from "@/components/settings/settings-summary-section";

export const dynamic = "force-dynamic";

export default async function SettingsLinearPage() {
  const overview = await loadSettingsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Linear</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Active Linear workspace from durable control-plane state.
        </p>
      </div>
      <SettingsSummarySection
        title="Workspace"
        description="Connection replacement and repair editors are planned for a later settings update."
        rows={[
          { label: "Team", value: overview.linear.teamName ?? "Not configured" },
          { label: "Team key", value: overview.linear.teamKey ?? "—" },
          { label: "Project", value: overview.linear.projectName ?? "Not configured" },
        ]}
      />
    </div>
  );
}
