import { repoUrlsEquivalent } from "../resolver/normalize-repo.js";
import type { GitHubClient, GitHubCheckRun } from "./client.js";
import { GitHubApiError } from "./client.js";
import type { ParsedPrUrl } from "./pr-url.js";

export interface PrChangedFile {
  path: string;
  status: string;
}

export interface PrCheckInfo {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
}

export interface PrInspectionResult {
  title: string;
  url: string;
  branch: string;
  baseBranch: string;
  state: string;
  merged: boolean;
  repoUrl: string;
  changedFiles: PrChangedFile[];
  checks: PrCheckInfo[];
  checkSummary: string;
  comments: { author: string; body: string; createdAt: string }[];
  rawChecks: GitHubCheckRun[] | null;
}

function summarizeChecks(checks: PrCheckInfo[]): string {
  if (checks.length === 0) {
    return "No GitHub check runs reported for the PR head commit.";
  }

  const passed = checks.filter((c) => c.conclusion === "success").length;
  const failed = checks.filter(
    (c) => c.conclusion === "failure" || c.conclusion === "cancelled",
  ).length;
  const pending = checks.filter(
    (c) => c.status !== "completed" || c.conclusion === null,
  ).length;

  const lines = [
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    `- Pending/unknown: ${pending}`,
  ];

  const notableFailures = checks.filter((c) => c.conclusion === "failure");
  for (const check of notableFailures.slice(0, 5)) {
    lines.push(`- Failed check: ${check.name}${check.detailsUrl ? ` (${check.detailsUrl})` : ""}`);
  }

  return lines.join("\n");
}

export async function inspectPullRequest(
  client: GitHubClient,
  parsed: ParsedPrUrl,
  expectedTargetRepo: string,
): Promise<PrInspectionResult> {
  if (!repoUrlsEquivalent(parsed.repoUrl, expectedTargetRepo)) {
    throw new Error(
      `wrong_target_repo: PR repo ${parsed.repoUrl} does not match expected ${expectedTargetRepo}`,
    );
  }

  let pull;
  try {
    pull = await client.getPullRequest(parsed.owner, parsed.repo, parsed.pullNumber);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 401) {
      throw error;
    }
    throw error;
  }

  if (pull.state !== "open" || pull.merged) {
    throw new Error(`pr_closed: PR ${pull.html_url} is not open`);
  }

  const files = await client.getPullRequestFiles(
    parsed.owner,
    parsed.repo,
    parsed.pullNumber,
  );

  let rawChecks: GitHubCheckRun[] | null = null;
  let checks: PrCheckInfo[] = [];
  try {
    const checkPayload = await client.getCheckRunsForRef(
      parsed.owner,
      parsed.repo,
      pull.head.sha,
    );
    rawChecks = checkPayload.check_runs ?? [];
    checks = rawChecks.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      detailsUrl: run.details_url,
    }));
  } catch {
    rawChecks = null;
    checks = [];
  }

  const commentsRaw = await client.getIssueComments(
    parsed.owner,
    parsed.repo,
    parsed.pullNumber,
  );

  const comments = commentsRaw.map((comment) => ({
    author: comment.user?.login ?? "unknown",
    body: comment.body,
    createdAt: comment.created_at,
  }));

  const changedFiles = files.map((file) => ({
    path: file.filename,
    status: file.status,
  }));

  return {
    title: pull.title,
    url: pull.html_url,
    branch: pull.head.ref,
    baseBranch: pull.base.ref,
    state: pull.state,
    merged: pull.merged,
    repoUrl: parsed.repoUrl,
    changedFiles,
    checks,
    checkSummary: summarizeChecks(checks),
    comments,
    rawChecks,
  };
}

export function classifyGitHubError(error: unknown): "github_auth_failure" | "github_api_failure" {
  if (error instanceof GitHubApiError && error.status === 401) {
    return "github_auth_failure";
  }
  return "github_api_failure";
}
