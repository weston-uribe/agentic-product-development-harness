import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";

import { loadRemoteSetupSummary } from "@/lib/setup-server";
import { loadTargetRepoOverviewFields } from "@/lib/settings/load-target-repo-overview-fields";

export async function loadRepositoriesOverview() {
  const cwd = resolveHarnessWorkspaceDir();
  const [remoteSummary, targetRepoOverview] = await Promise.all([
    loadRemoteSetupSummary(),
    loadTargetRepoOverviewFields(cwd),
  ]);

  return targetRepoOverview.map((repo) => ({
    id: repo.id,
    targetRepo: repo.targetRepo,
    baseBranch: repo.baseBranch,
    previewProvider: repo.previewProvider,
    initializationStatus: repo.initializationStatus,
    initializationDetail: repo.initializationDetail,
    workflowStatus:
      remoteSummary.targetRepos.find(
        (remoteRepo) =>
          remoteRepo.repoConfigId === repo.id ||
          remoteRepo.targetRepo === repo.targetRepo,
      )?.workflowStatus ?? "unknown",
  }));
}

export type RepositoriesOverviewEntry = Awaited<
  ReturnType<typeof loadRepositoriesOverview>
>[number];
