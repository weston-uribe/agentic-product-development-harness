import { AutomationSettingsEditor } from "@/components/settings/editors/automation-settings-editor";
import { loadAutomationEditorData } from "@/lib/settings/load-settings-editor-data";

export const dynamic = "force-dynamic";

export default async function SettingsAutomationPage() {
  const data = await loadAutomationEditorData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Automation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit schema-backed automation controls stored in local harness config.
        </p>
      </div>
      <AutomationSettingsEditor
        initialAutomation={data.automation}
        initialConfigFingerprint={data.configFingerprint}
      />
    </div>
  );
}
