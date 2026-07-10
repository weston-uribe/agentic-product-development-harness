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
