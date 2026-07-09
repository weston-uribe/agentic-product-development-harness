import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveLocalFilePaths } from "./setup-state.js";

export const MANUAL_HARNESS_DISPATCH_REPO_PLACEHOLDER =
  "<harness-dispatch-repo>";

export type HarnessDispatchRepoSource =
  | "explicit-config"
  | "git-remote-origin"
  | "manual";

export interface HarnessDispatchRepoResolution {
  repo: string | null;
  source: HarnessDispatchRepoSource;
  resolved: boolean;
  detail?: string;
}

export function parseGitHubRepoSlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const httpsMatch = trimmed.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
  );
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = trimmed.match(
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  );
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const slugMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (slugMatch) {
    return `${slugMatch[1]}/${slugMatch[2]}`;
  }

  return null;
}

export function parseGitRemoteOriginUrl(remoteUrl: string): string | null {
  return parseGitHubRepoSlug(remoteUrl);
}

export async function readGitRemoteOrigin(cwd?: string): Promise<string | null> {
  const root = cwd ?? process.cwd();
  const configPath = path.join(root, ".git", "config");

  try {
    const content = await readFile(configPath, "utf8");
    const remoteSection = content.match(
      /\[remote "origin"\][\s\S]*?(?=\[|$)/,
    );
    if (!remoteSection) {
      return null;
    }

    const urlMatch = remoteSection[0].match(/^\s*url\s*=\s*(.+)$/m);
    return urlMatch?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

export function resolveHarnessDispatchRepoFromInputs(input?: {
  explicitRepo?: string;
  gitRemoteOriginUrl?: string | null;
  manualRepo?: string;
}): HarnessDispatchRepoResolution {
  const explicitSlug = input?.explicitRepo
    ? parseGitHubRepoSlug(input.explicitRepo)
    : null;
  if (explicitSlug) {
    return {
      repo: explicitSlug,
      source: "explicit-config",
      resolved: true,
      detail: "Resolved from explicit setup/config value.",
    };
  }

  if (input?.gitRemoteOriginUrl) {
    const originSlug = parseGitRemoteOriginUrl(input.gitRemoteOriginUrl);
    if (originSlug) {
      return {
        repo: originSlug,
        source: "git-remote-origin",
        resolved: true,
        detail: "Resolved from harness repo git remote origin.",
      };
    }
  }

  const manualSlug = input?.manualRepo
    ? parseGitHubRepoSlug(input.manualRepo)
    : null;
  if (manualSlug) {
    return {
      repo: manualSlug,
      source: "manual",
      resolved: true,
      detail: "Resolved from manual operator input.",
    };
  }

  return {
    repo: null,
    source: "manual",
    resolved: false,
    detail:
      "Harness dispatch repo is unknown. Provide GITHUB_DISPATCH_REPOSITORY, ensure git remote origin is set, or enter the repo manually.",
  };
}

export function formatHarnessDispatchRepo(
  resolution: HarnessDispatchRepoResolution,
): string {
  return resolution.repo ?? MANUAL_HARNESS_DISPATCH_REPO_PLACEHOLDER;
}

async function readEnvLocalKey(
  envLocalPath: string,
  key: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(envLocalPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }
      const lineKey = trimmed.slice(0, separator).trim();
      if (lineKey !== key) {
        continue;
      }
      const value = trimmed.slice(separator + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  } catch {
    // missing file is valid state
  }
  return undefined;
}

export async function resolveHarnessDispatchRepo(options?: {
  cwd?: string;
  explicitRepo?: string;
  manualRepo?: string;
}): Promise<HarnessDispatchRepoResolution> {
  const paths = resolveLocalFilePaths(options?.cwd);
  const envLocalDispatchRepo = await readEnvLocalKey(
    paths.envLocal,
    "GITHUB_DISPATCH_REPOSITORY",
  );
  const explicitRepo =
    options?.explicitRepo ??
    envLocalDispatchRepo ??
    process.env.GITHUB_DISPATCH_REPOSITORY;
  const gitRemoteOriginUrl = await readGitRemoteOrigin(options?.cwd);

  return resolveHarnessDispatchRepoFromInputs({
    explicitRepo,
    gitRemoteOriginUrl,
    manualRepo: options?.manualRepo,
  });
}
