const GITHUB_HTTPS_PREFIX = "https://github.com/";

export function normalizeRepoUrl(input: string): string {
  const trimmed = input.trim().replace(/\/$/, "");

  if (trimmed.startsWith(GITHUB_HTTPS_PREFIX)) {
    return trimmed;
  }

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return `${GITHUB_HTTPS_PREFIX}${trimmed}`;
  }

  return trimmed;
}

export function isValidGithubRepoUrl(url: string): boolean {
  return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url);
}
