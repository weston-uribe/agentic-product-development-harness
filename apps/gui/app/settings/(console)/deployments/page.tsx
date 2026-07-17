import { DeploymentsSettingsEditor } from "@/components/settings/editors/deployments-settings-editor";
import { loadDeploymentsEditorData } from "@/lib/settings/load-settings-editor-data";

export const dynamic = "force-dynamic";

export default async function SettingsDeploymentsPage() {
  const { summary } = await loadDeploymentsEditorData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Deployments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Replace the active Vercel project and verify bridge endpoint configuration.
        </p>
      </div>
      <DeploymentsSettingsEditor initialSummary={summary} />
    </div>
  );
}
