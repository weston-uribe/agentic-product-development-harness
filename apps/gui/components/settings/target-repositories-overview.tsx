import { SectionCard } from "@/components/custom/section-card";
import type { RepositoriesOverviewEntry } from "@/lib/settings/load-repositories-overview";

type TargetRepositoriesOverviewProps = {
  repos: RepositoriesOverviewEntry[];
};

export function TargetRepositoriesOverview({
  repos,
}: TargetRepositoriesOverviewProps) {
  return (
    <SectionCard
      title="Repository status"
      description="Read-only health from local config, development-branch product marker, and workflow presence."
    >
      {repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No target repositories configured.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {repos.map((repo) => (
            <li
              key={repo.id || repo.targetRepo}
              className="space-y-1 rounded-md border border-border bg-muted/20 p-3"
            >
              <p className="break-all font-medium">{repo.targetRepo}</p>
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
                <p className="text-xs text-muted-foreground">{repo.initializationDetail}</p>
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
        Application preview provider comes from local harness config. The PDev automation bridge
        (Vercel + Linear webhook) is configured separately in guided setup Step 3.
      </p>
    </SectionCard>
  );
}
