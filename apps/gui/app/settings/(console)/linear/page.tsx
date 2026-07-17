import { LinearSettingsEditor } from "@/components/settings/editors/linear-settings-editor";
import { loadLinearEditorData } from "@/lib/settings/load-settings-editor-data";

export const dynamic = "force-dynamic";

export default async function SettingsLinearPage() {
  const { summary } = await loadLinearEditorData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Linear</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Replace the active Linear workspace connection and repair workflow statuses.
        </p>
      </div>
      <LinearSettingsEditor initialSummary={summary} />
    </div>
  );
}
