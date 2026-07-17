import { assertCloudConfigFingerprintFromEnv } from "../config/assert-cloud-config-fingerprint.js";
import {
  parseHarnessManagedRepoMarkerJson,
  validateManagedMarkerForReconnect,
} from "./harness-managed-repo-marker.js";
import { readLocalManagedRepoMarker } from "./runner-upgrade.js";
import { readWorkflowConfigSnapshot } from "./workflow-config-snapshot.js";

export interface RunnerConfigCanaryResult {
  ok: boolean;
  markerValid: boolean;
  cloudConfigValid: boolean;
  repository?: string;
  repositoryId?: number;
  snapshotContentId?: string;
  packageVersion?: string;
  linearTeamKey?: string;
  targetRepos: Array<{ id: string; targetRepo: string }>;
  message?: string;
}

function formatCanaryOutput(result: RunnerConfigCanaryResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

async function appendGithubStepSummary(content: string): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  const { appendFile } = await import("node:fs/promises");
  await appendFile(summaryPath, `${content}\n`, "utf8");
}

export async function runRunnerConfigCanary(
  cwd?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunnerConfigCanaryResult> {
  const markerRaw = await readLocalManagedRepoMarker(cwd);
  if (!markerRaw) {
    return {
      ok: false,
      markerValid: false,
      cloudConfigValid: false,
      targetRepos: [],
      message: "Managed repository marker is missing locally.",
    };
  }

  const parsedMarker = parseHarnessManagedRepoMarkerJson(markerRaw);
  if (!parsedMarker.ok) {
    return {
      ok: false,
      markerValid: false,
      cloudConfigValid: false,
      targetRepos: [],
      message: parsedMarker.reason,
    };
  }

  const reconnect = validateManagedMarkerForReconnect(
    parsedMarker.marker,
    parsedMarker.marker.repository,
    parsedMarker.marker.repositoryId
      ? { repositoryId: parsedMarker.marker.repositoryId }
      : undefined,
  );
  if (!reconnect.ok) {
    return {
      ok: false,
      markerValid: false,
      cloudConfigValid: false,
      repository: parsedMarker.marker.repository,
      repositoryId: parsedMarker.marker.repositoryId,
      targetRepos: [],
      message: reconnect.reason,
    };
  }

  let cloudConfigValid = true;
  let cloudMessage: string | undefined;
  try {
    assertCloudConfigFingerprintFromEnv(env);
  } catch (error) {
    cloudConfigValid = false;
    cloudMessage =
      error instanceof Error ? error.message : "Cloud config fingerprint check failed.";
  }

  let linearTeamKey: string | undefined;
  const targetRepos: Array<{ id: string; targetRepo: string }> = [];
  try {
    const snapshot = await readWorkflowConfigSnapshot(cwd);
    linearTeamKey = snapshot.config.linear?.teamKey;
    for (const repo of snapshot.config.repos) {
      targetRepos.push({ id: repo.id, targetRepo: repo.targetRepo });
    }
  } catch (error) {
    return {
      ok: false,
      markerValid: true,
      cloudConfigValid,
      repository: parsedMarker.marker.repository,
      repositoryId: parsedMarker.marker.repositoryId,
      snapshotContentId:
        parsedMarker.marker.createdFromPackageSnapshot?.snapshotContentId,
      packageVersion:
        parsedMarker.marker.createdFromPackageSnapshot?.packageVersion,
      linearTeamKey,
      targetRepos,
      message:
        error instanceof Error
          ? error.message
          : "Could not read harness config for canary association checks.",
    };
  }

  const ok = cloudConfigValid;
  const result: RunnerConfigCanaryResult = {
    ok,
    markerValid: true,
    cloudConfigValid,
    repository: parsedMarker.marker.repository,
    repositoryId: parsedMarker.marker.repositoryId,
    snapshotContentId:
      parsedMarker.marker.createdFromPackageSnapshot?.snapshotContentId,
    packageVersion: parsedMarker.marker.createdFromPackageSnapshot?.packageVersion,
    linearTeamKey,
    targetRepos,
    message: ok
      ? "Runner configuration canary passed."
      : cloudMessage ?? "Runner configuration canary failed.",
  };

  const output = formatCanaryOutput(result);
  process.stdout.write(output);
  await appendGithubStepSummary(
    `# PDev runner config canary\n\n\`\`\`json\n${output.trim()}\n\`\`\`\n`,
  );

  return result;
}
