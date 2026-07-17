import "server-only";

import { loadHarnessConfig } from "@harness/config/load-config";
import { createLiveGitHubTargetRepositoryProvider } from "@harness/setup/github-target-repository-provider-live";
import {
  loadGithubTokenFromEnvLocal,
  hasGithubTokenConfigured,
} from "@harness/setup/setup-github-auth";
import { readProductMarker } from "@harness/product/read-product-marker";
import {
  resolveProductInitializationState,
  type ProductInitializationState,
} from "@harness/product/initialization-state";

export interface TargetRepoOverviewEntry {
  id: string;
  targetRepo: string;
  baseBranch: string;
  previewProvider: string;
  initializationStatus: ProductInitializationState | "unavailable";
  initializationDetail?: string;
}

export async function loadTargetRepoOverviewFields(
  cwd: string,
): Promise<TargetRepoOverviewEntry[]> {
  let configRepos: Array<{
    id: string;
    targetRepo: string;
    baseBranch?: string;
    previewProvider?: string;
  }> = [];

  try {
    const { config } = await loadHarnessConfig({ baseDir: cwd });
    configRepos = config.repos.map((repo) => ({
      id: repo.id,
      targetRepo: repo.targetRepo,
      baseBranch: repo.baseBranch,
      previewProvider: repo.previewProvider,
    }));
  } catch {
    return [];
  }

  const token = await loadGithubTokenFromEnvLocal({ cwd });
  const provider = hasGithubTokenConfigured(token)
    ? createLiveGitHubTargetRepositoryProvider(token!)
    : undefined;

  const entries: TargetRepoOverviewEntry[] = [];

  for (const repo of configRepos) {
    const baseBranch = repo.baseBranch?.trim() || "dev";
    const previewProvider = repo.previewProvider?.trim() || "none";
    let initializationStatus: TargetRepoOverviewEntry["initializationStatus"] =
      "unavailable";
    let initializationDetail: string | undefined;

    if (provider && repo.targetRepo.trim()) {
      try {
        const markerRead = await readProductMarker({
          targetRepo: repo.targetRepo,
          developmentBranch: baseBranch,
          provider,
        });
        const resolved = resolveProductInitializationState(markerRead.content);
        initializationStatus = resolved.state;
        initializationDetail = resolved.reason;
      } catch (error) {
        initializationStatus = "unavailable";
        initializationDetail =
          error instanceof Error
            ? error.message
            : "Could not read product marker from development branch.";
      }
    } else if (!provider) {
      initializationDetail =
        "Save GITHUB_TOKEN in .env.local to read the product marker from the development branch.";
    }

    entries.push({
      id: repo.id,
      targetRepo: repo.targetRepo,
      baseBranch,
      previewProvider,
      initializationStatus,
      initializationDetail,
    });
  }

  return entries;
}
