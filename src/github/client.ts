export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

export interface GitHubClientOptions {
  token: string;
}

export interface GitHubPullRequest {
  title: string;
  html_url: string;
  state: string;
  merged: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { ref: string; sha: string };
  base: { ref: string };
}

export interface GitHubPullFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface GitHubIssueComment {
  id: number;
  user: { login: string } | null;
  body: string;
  created_at: string;
}

export interface GitHubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  details_url: string | null;
}

export interface GitHubCommitStatus {
  state: string;
  context: string;
  target_url: string | null;
}

export interface GitHubCombinedStatus {
  state: string;
  statuses: GitHubCommitStatus[];
}

const GITHUB_API = "https://api.github.com";

export class GitHubClient {
  private readonly token: string;

  constructor(options: GitHubClientOptions) {
    this.token = options.token;
  }

  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const response = await fetch(`${GITHUB_API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new GitHubApiError(
        response.status,
        text || `GitHub API request failed: ${response.status}`,
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  async getAuthenticatedUser(): Promise<{ login: string }> {
    return this.request<{ login: string }>("/user");
  }

  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    );
  }

  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GitHubPullFile[]> {
    return this.request<GitHubPullFile[]>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
    );
  }

  async getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubIssueComment[]> {
    return this.request<GitHubIssueComment[]>(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    );
  }

  async getCheckRunsForRef(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<{ check_runs: GitHubCheckRun[] }> {
    return this.request<{ check_runs: GitHubCheckRun[] }>(
      `/repos/${owner}/${repo}/commits/${ref}/check-runs`,
    );
  }

  async getCombinedStatusForRef(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHubCombinedStatus> {
    return this.request<GitHubCombinedStatus>(
      `/repos/${owner}/${repo}/commits/${ref}/status`,
    );
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    options: {
      mergeMethod: "squash" | "merge" | "rebase";
      commitTitle?: string;
    },
  ): Promise<{ sha: string; merged: boolean; message?: string }> {
    return this.request<{ sha: string; merged: boolean; message?: string }>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      {
        method: "PUT",
        body: {
          merge_method: options.mergeMethod,
          ...(options.commitTitle ? { commit_title: options.commitTitle } : {}),
        },
      },
    );
  }
}

export async function pingGitHub(token: string): Promise<string> {
  const client = new GitHubClient({ token });
  const user = await client.getAuthenticatedUser();
  return user.login;
}
