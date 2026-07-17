import { loadHarnessConfigSummary } from "@/lib/settings/load-harness-config-summary";
import { SettingsSummarySection } from "@/components/settings/settings-summary-section";

export const dynamic = "force-dynamic";

export default async function SettingsAutomationPage() {
  const config = await loadHarnessConfigSummary();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Automation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Schema-backed automation fields from local harness config.
        </p>
      </div>
      <SettingsSummarySection
        title="Orchestrator"
        description="Editable automation controls are planned for a later settings update."
        rows={[
          { label: "Orchestrator marker", value: config.orchestratorMarker },
          { label: "Log directory", value: config.logDirectory },
          { label: "Allowed target repos", value: String(config.allowedTargetRepos.length) },
        ]}
      />
    </div>
  );
}
