const ISSUE_KEY_PATTERN = /^[A-Z]+-[0-9]+$/;
const REPO_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const VALID_PHASES = new Set([
  "auto",
  "planning",
  "implementation",
  "handoff",
  "revision",
  "merge",
]);

const VALID_FORCE = new Set(["true", "false"]);

export function validateIssueKey(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }
  return ISSUE_KEY_PATTERN.test(value.trim().toUpperCase());
}

export function validatePhase(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }
  return VALID_PHASES.has(value.trim().toLowerCase());
}

export function validateForce(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }
  return VALID_FORCE.has(value.trim().toLowerCase());
}

export function validateRepoId(
  value: string | null | undefined,
  allowedIds: readonly string[],
): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!REPO_ID_PATTERN.test(trimmed)) {
    return false;
  }
  return allowedIds.includes(trimmed);
}

export const DEFAULT_SYNC_REPO_IDS = ["portfolio", "harness"] as const;
