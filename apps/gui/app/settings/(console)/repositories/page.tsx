import { RepositoriesSettingsEditor } from "@/components/settings/editors/repositories-settings-editor";
import { loadRepositoriesEditorData } from "@/lib/settings/load-settings-editor-data";

export const dynamic = "force-dynamic";

export default async function SettingsRepositoriesPage() {
  const data = await loadRepositoriesEditorData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Target repositories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add, edit, or detach target repositories in local harness config only.
        </p>
      </div>
      <RepositoriesSettingsEditor
        initialConfigForm={data.configForm}
        initialConfigFingerprint={data.configFingerprint}
      />
    </div>
  );
}
