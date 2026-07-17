import { loadSettingsOverview } from "@/lib/settings/load-settings-overview";
import { SettingsSummarySection } from "@/components/settings/settings-summary-section";

export const dynamic = "force-dynamic";

export default async function SettingsDeploymentsPage() {
  const overview = await loadSettingsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Deployments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Vercel bridge state from durable control-plane records.
        </p>
      </div>
      <SettingsSummarySection
        title="Vercel project"
        description="Project replacement and redeploy verification are planned for a later settings update."
        rows={[
          { label: "Project", value: overview.vercel.projectName ?? "Not configured" },
          { label: "Production URL", value: overview.vercel.productionUrl ?? "—" },
          {
            label: "Linear webhook",
            value: overview.vercel.webhookVerified ? "Verified" : "Not verified",
          },
        ]}
      />
    </div>
  );
}
