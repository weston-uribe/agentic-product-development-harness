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
  node_id: string;
  title: string;
  html_url: string;
  state: string;
  merged: boolean;
  draft?: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  rebaseable?: boolean | null;
  head: { ref: string; sha: string };
  base: { ref: string };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
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

export interface GitHubPullRequestListItem {
  number: number;
  html_url: string;
  state: string;
  created_at: string;
  head: { ref: string; sha: string };
  base: { ref: string };
}

export interface GitHubCompareResult {
  status: "identical" | "ahead" | "behind" | "diverged";
  ahead_by: number;
  behind_by: number;
  commits: Array<{ sha: string; commit: { message: string } }>;
}

export interface GitHubGitRef {
  ref: string;
  object: { sha: string; type: string; url: string };
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

  private async graphqlRequest<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${GITHUB_API}/graphql`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new GitHubApiError(
        response.status,
        text || `GitHub GraphQL request failed: ${response.status}`,
      );
    }

    const payload = (await response.json()) as GraphQLResponse<T>;
    if (payload.errors?.length) {
      throw new GitHubApiError(
        422,
        payload.errors.map((error) => error.message).join("; "),
      );
    }
    if (!payload.data) {
      throw new GitHubApiError(422, "GitHub GraphQL response missing data");
    }

    return payload.data;
  }

  async getAuthenticatedUser(): Promise<{ login: string }> {
    return this.request<{ login: string }>("/user");
  }

  async getBranchRef(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubGitRef> {
    return this.request<GitHubGitRef>(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
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

  async markPullRequestReadyForReview(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GitHubPullRequest> {
    const pull = await this.getPullRequest(owner, repo, pullNumber);
    await this.graphqlRequest<{
      markPullRequestReadyForReview: {
        pullRequest: { isDraft: boolean } | null;
      };
    }>(
      `mutation MarkPullRequestReadyForReview($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest { isDraft }
        }
      }`,
      { pullRequestId: pull.node_id },
    );
    return this.getPullRequest(owner, repo, pullNumber);
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

  async listPullRequests(
    owner: string,
    repo: string,
    options: {
      state?: "open" | "closed" | "all";
      base?: string;
      sort?: "created" | "updated";
      direction?: "asc" | "desc";
    } = {},
  ): Promise<GitHubPullRequestListItem[]> {
    const params = new URLSearchParams();
    params.set("state", options.state ?? "open");
    if (options.base) {
      params.set("base", options.base);
    }
    params.set("sort", options.sort ?? "created");
    params.set("direction", options.direction ?? "desc");
    return this.request<GitHubPullRequestListItem[]>(
      `/repos/${owner}/${repo}/pulls?${params.toString()}`,
    );
  }

  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string,
  ): Promise<GitHubCompareResult> {
    return this.request<GitHubCompareResult>(
      `/repos/${owner}/${repo}/compare/${base}...${head}`,
    );
  }
}

export async function pingGitHub(token: string): Promise<string> {
  const client = new GitHubClient({ token });
  const user = await client.getAuthenticatedUser();
  return user.login;
}
