import type { ServiceVerificationUi } from "@/components/custom/environment-config-form";
import type { RepoVerificationUi } from "@/components/custom/target-repo-config-form";

/** Non-secret in-memory fingerprint for comparing typed secret values. */
export function valueFingerprint(value: string): string {
  const trimmed = value.trim();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash << 5) - hash + trimmed.charCodeAt(i);
    hash |= 0;
  }
  return `fp:${hash}:${trimmed.length}`;
}

export function isServiceVerifiedForValue(
  verification: ServiceVerificationUi,
  value: string,
): boolean {
  if (verification.state !== "connected") {
    return false;
  }
  if (!value.trim()) {
    return false;
  }
  return verification.verifiedValueFingerprint === valueFingerprint(value);
}

export function isServiceFailedForValue(
  verification: ServiceVerificationUi,
  value: string,
): boolean {
  if (verification.state !== "failed") {
    return false;
  }
  if (!value.trim()) {
    return false;
  }
  return verification.attemptedValueFingerprint === valueFingerprint(value);
}

export function isRepoVerifiedForUrl(
  verification: RepoVerificationUi | undefined,
  targetRepo: string,
): boolean {
  if (!verification || verification.state !== "connected") {
    return false;
  }
  const normalized = targetRepo.trim();
  if (!normalized) {
    return false;
  }
  return verification.verifiedTargetRepo === normalized;
}

export type GitHubTokenSource = "typed" | "saved";

/** Non-secret fingerprint for repo checks that used the saved `.env.local` token. */
export const SAVED_GITHUB_TOKEN_FINGERPRINT = "saved-local";

export interface ActiveGitHubToken {
  /** Present when the user pasted a token in Step 1 during this session. */
  tokenForRequest?: string;
  source: GitHubTokenSource;
  fingerprint: string;
}

export function resolveActiveGitHubToken(options: {
  typedToken: string;
  hasSavedToken: boolean;
}): ActiveGitHubToken | null {
  const trimmed = options.typedToken.trim();
  if (trimmed) {
    return {
      tokenForRequest: trimmed,
      source: "typed",
      fingerprint: valueFingerprint(trimmed),
    };
  }

  if (options.hasSavedToken) {
    return {
      source: "saved",
      fingerprint: SAVED_GITHUB_TOKEN_FINGERPRINT,
    };
  }

  return null;
}

export const GITHUB_TOKEN_SOURCE_HINT: Record<GitHubTokenSource, string> = {
  typed: "Using current GitHub token from Step 1.",
  saved: "Using saved GitHub token.",
};

export function isRepoVerifiedForActiveToken(
  verification: RepoVerificationUi | undefined,
  targetRepo: string,
  activeGithubTokenFingerprint: string | null,
): boolean {
  if (!activeGithubTokenFingerprint) {
    return false;
  }
  if (!isRepoVerifiedForUrl(verification, targetRepo)) {
    return false;
  }
  return (
    verification?.verifiedGithubTokenFingerprint === activeGithubTokenFingerprint
  );
}

export function isRepoFailedForActiveToken(
  verification: RepoVerificationUi | undefined,
  targetRepo: string,
  activeGithubTokenFingerprint: string | null,
): boolean {
  if (!activeGithubTokenFingerprint || !verification) {
    return false;
  }
  if (verification.state !== "failed") {
    return false;
  }
  const normalized = targetRepo.trim();
  if (!normalized || verification.attemptedTargetRepo !== normalized) {
    return false;
  }
  return (
    verification.attemptedGithubTokenFingerprint === activeGithubTokenFingerprint
  );
}

export function createGuidedRepoRowId(counter: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `guided-repo-${counter}`;
}

export type GuidedRepoRow = {
  rowId: string;
  id: string;
  targetRepo: string;
  baseBranch?: string;
  productionBranch?: string;
  linearProjects?: string;
  linearTeams?: string;
  previewProvider?: string;
  integrationPreviewUrl?: string;
  productionUrl?: string;
  integrationSuccessStatus?: string;
  productionSuccessStatus?: string;
  validationCommands?: string;
};

export function guidedRowsFromConfig(
  config: { repos: Array<Omit<GuidedRepoRow, "rowId">> },
  startCounter = 1,
): GuidedRepoRow[] {
  const repos =
    config.repos.length > 0 ? config.repos : [{ id: "", targetRepo: "" }];
  return repos.map((repo, index) => ({
    ...repo,
    rowId: createGuidedRepoRowId(startCounter + index),
  }));
}

export function guidedRowsToConfigRepos(
  rows: GuidedRepoRow[],
): Array<Omit<GuidedRepoRow, "rowId">> {
  return rows.map(({ rowId: _rowId, ...repo }) => repo);
}
