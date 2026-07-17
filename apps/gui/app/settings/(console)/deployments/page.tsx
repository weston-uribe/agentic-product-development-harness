import { DeploymentsSettingsEditor } from "@/components/settings/editors/deployments-settings-editor";
import { RunnerUpgradeSettingsCard } from "@/components/settings/editors/runner-upgrade-settings-card";
import { loadDeploymentsEditorData } from "@/lib/settings/load-settings-editor-data";

export const dynamic = "force-dynamic";

export default async function SettingsDeploymentsPage() {
  const { summary, runnerUpgradeStatus } = await loadDeploymentsEditorData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Deployments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the managed PDev runner and configure Vercel deployment bridge settings.
        </p>
      </div>
      <RunnerUpgradeSettingsCard initialStatus={runnerUpgradeStatus} />
      <DeploymentsSettingsEditor initialSummary={summary} />
    </div>
  );
}
