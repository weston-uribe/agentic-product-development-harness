import Link from "next/link";
import { SectionCard } from "@/components/custom/section-card";
import { loadSettingsOverview } from "@/lib/settings/load-settings-overview";

export const dynamic = "force-dynamic";

export default async function SettingsOverviewPage() {
  const overview = await loadSettingsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cached workspace state from local configuration and durable control-plane records.
        </p>
      </div>

      <SectionCard
        title="Setup status"
        description="Routing uses durable initial setup completion only."
      >
        <p className="text-sm">
          {overview.setupComplete ? (
            <>
              <span className="font-medium text-foreground">Setup complete</span>
              {overview.completedAt ? (
                <span className="text-muted-foreground">
                  {" "}
                  — completed {new Date(overview.completedAt).toLocaleString()}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">Initial setup is not complete.</span>
          )}
        </p>
        {overview.doctorSummary.failed ? (
          <p className="text-sm text-muted-foreground">
            Some local doctor checks are failing. Review{" "}
            <Link href="/settings/diagnostics" className="font-medium text-primary underline-offset-4 hover:underline">
              Diagnostics
            </Link>{" "}
            for details.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Harness repository" description="GitHub dispatch repository for cloud actions.">
        <p className="text-sm">{overview.harnessDispatchRepo || "Not configured"}</p>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Linear" description="Active workspace connection.">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Team</dt>
              <dd>
                {overview.linear.teamName
                  ? `${overview.linear.teamName} (${overview.linear.teamKey ?? "—"})`
                  : "Not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Project</dt>
              <dd>{overview.linear.projectName ?? "Not configured"}</dd>
            </div>
          </dl>
          <Link href="/settings/linear" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            View Linear settings
          </Link>
        </SectionCard>

        <SectionCard title="Deployments" description="Active Vercel bridge.">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Project</dt>
              <dd>{overview.vercel.projectName ?? "Not configured"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Production URL</dt>
              <dd>{overview.vercel.productionUrl ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Linear webhook</dt>
              <dd>{overview.vercel.webhookVerified ? "Verified" : "Not verified"}</dd>
            </div>
          </dl>
          <Link href="/settings/deployments" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            View deployment settings
          </Link>
        </SectionCard>
      </div>

      <SectionCard title="Credentials" description="Presence only — values are never shown.">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(overview.credentials).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4 sm:block">
              <dt className="text-muted-foreground capitalize">{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <Link href="/settings/connections" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          View connections
        </Link>
      </SectionCard>

      <SectionCard title="Target repositories" description="Configured target repos, application preview provider, and product marker status from the development branch.">
        {overview.targetRepos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No target repositories configured.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {overview.targetRepos.map((repo) => (
              <li
                key={repo.id}
                className="rounded-md border border-border bg-muted/20 p-3 space-y-1"
              >
                <p className="font-medium break-all">{repo.targetRepo}</p>
                <p className="text-muted-foreground">
                  Config ID: {repo.id || "—"} · Base branch: {repo.baseBranch}
                </p>
                <p className="text-muted-foreground">
                  Application preview provider: {repo.previewProvider}
                </p>
                <p className="text-muted-foreground">
                  Product initialization: {repo.initializationStatus}
                </p>
                {repo.initializationDetail ? (
                  <p className="text-xs text-muted-foreground">
                    {repo.initializationDetail}
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  Target workflow:{" "}
                  {repo.workflowStatus === "present" ? "present" : repo.workflowStatus}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Application preview provider comes from local harness config. The PDev
          automation bridge (Vercel + Linear webhook) is configured separately in
          guided setup Step 3.
        </p>
        <Link href="/settings/repositories" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          View repositories
        </Link>
      </SectionCard>

      <SectionCard title="Models" description="Role models from local harness config.">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Planner</dt>
            <dd>{overview.models.planner ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Builder</dt>
            <dd>{overview.models.builder ?? "—"}</dd>
          </div>
          {overview.models.cloudSyncedAt ? (
            <div>
              <dt className="text-muted-foreground">Last cloud sync evidence</dt>
              <dd>{new Date(overview.models.cloudSyncedAt).toLocaleString()}</dd>
            </div>
          ) : null}
        </dl>
        <Link href="/settings/models" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Edit models
        </Link>
      </SectionCard>
    </div>
  );
}
