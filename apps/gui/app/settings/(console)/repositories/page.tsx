import { loadSettingsOverview } from "@/lib/settings/load-settings-overview";
import { SettingsSummarySection } from "@/components/settings/settings-summary-section";

export const dynamic = "force-dynamic";

export default async function SettingsRepositoriesPage() {
  const overview = await loadSettingsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Target repositories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Repositories configured in local harness config.
        </p>
      </div>
      {overview.targetRepos.length === 0 ? (
        <SettingsSummarySection
          title="Repositories"
          description="No target repositories are configured yet."
          rows={[{ label: "Status", value: "Empty" }]}
        />
      ) : (
        overview.targetRepos.map((repo) => (
          <SettingsSummarySection
            key={repo.id}
            title={repo.targetRepo}
            description={`Config id: ${repo.id}`}
            rows={[
              {
                label: "Workflow file",
                value: repo.workflowStatus === "present" ? "Present" : repo.workflowStatus,
              },
            ]}
          />
        ))
      )}
    </div>
  );
}
