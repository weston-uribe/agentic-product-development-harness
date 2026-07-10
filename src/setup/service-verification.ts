import {
  assessClassicPatGuidedCapabilities,
  FINE_GRAINED_WORKFLOW_WRITE_LIMITATION,
  GITHUB_CLASSIC_PAT_MISSING_WORKFLOW_MESSAGE,
  GITHUB_FINE_GRAINED_STEP1_LIMITATION,
  GITHUB_TOKEN_GUIDED_HELPER_TEXT,
  GITHUB_WORKFLOW_SCOPE_SETUP_ERROR,
  resolveGitHubTokenType,
  type GitHubTokenMetadata,
} from "./github-workflow-permissions.js";
import { GitHubApiError, GitHubClient } from "../github/client.js";
import { parseGitHubRepoUrl } from "../github/base-branch.js";
import { pingLinear } from "../linear/client.js";
import { redactKnownSecretValues } from "./redact-secrets.js";
import { parseGitHubRepoSlug } from "./github-repo-slug.js";
import { readExistingEnvFile } from "./env-merge.js";
import { resolveLocalFilePaths } from "./setup-state.js";

export type SetupServiceName = "linear" | "cursor" | "github";

export type VerificationStatus = "connected" | "failed";

export interface ServiceVerificationResult {
  status: VerificationStatus;
  label?: string;
  message: string;
  limitation?: string;
}

export interface RepoVerificationResult {
  status: VerificationStatus;
  message: string;
  repoSlug?: string;
  normalizedUrl?: string;
  workflowInstallReady?: boolean;
  limitation?: string;
}

export async function inspectGitHubTokenMetadata(
  token: string,
): Promise<GitHubTokenMetadata> {
  const client = new GitHubClient({ token: token.trim() });
  const inspected = await client.inspectAuthenticatedUser();
  const tokenType = resolveGitHubTokenType(
    inspected.tokenType,
    inspected.oauthScopes,
  );

  return {
    login: inspected.login,
    tokenType,
    oauthScopes: inspected.oauthScopes,
    hasWorkflowScope: inspected.oauthScopes.includes("workflow"),
    hasRepoScope:
      inspected.oauthScopes.includes("repo") ||
      inspected.oauthScopes.includes("public_repo"),
  };
}

function isWorkflowPermissionApiError(error: GitHubApiError): boolean {
  return (
    (error.status === 403 || error.status === 404) &&
    /workflow/i.test(error.message)
  );
}

function sanitizeMessage(message: string, secrets: readonly string[]): string {
  return redactKnownSecretValues(message, secrets);
}

function formatGitHubTokenError(error: unknown, token: string): string {
  if (error instanceof GitHubApiError) {
    if (error.status === 401) {
      return "GitHub rejected this token. Check that GITHUB_TOKEN is valid and not expired.";
    }
    if (error.status === 403) {
      return "GitHub accepted the request but denied access. The token may lack required scopes.";
    }
    return sanitizeMessage(
      `GitHub API returned HTTP ${error.status}. Check the token and try again.`,
      [token],
    );
  }
  const raw = error instanceof Error ? error.message : String(error);
  return sanitizeMessage(raw, [token]);
}

function formatLinearTokenError(error: unknown, token: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/unauthorized|invalid|forbidden|authentication/i.test(raw)) {
    return "Linear rejected this API key. Check that LINEAR_API_KEY is valid.";
  }
  return sanitizeMessage(raw, [token]);
}

function formatCursorTokenError(error: unknown, token: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/unauthorized|invalid|forbidden|authentication|401|403/i.test(raw)) {
    return "Cursor rejected this API key. Check that CURSOR_API_KEY is valid.";
  }
  return sanitizeMessage(raw, [token]);
}

export function parseTargetRepoUrl(targetRepo: string): {
  owner: string;
  repo: string;
  slug: string;
  normalizedUrl: string;
} | null {
  const parsed = parseGitHubRepoUrl(targetRepo.trim());
  if (!parsed) {
    return null;
  }
  const slug = `${parsed.owner}/${parsed.repo}`;
  return {
    ...parsed,
    slug,
    normalizedUrl: `https://github.com/${slug}`,
  };
}

export async function verifyLinearToken(
  token: string,
): Promise<ServiceVerificationResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return {
      status: "failed",
      message: "Enter a Linear API key before verifying.",
    };
  }

  try {
    const label = await pingLinear(trimmed);
    return {
      status: "connected",
      label,
      message: `Connected as ${label}.`,
    };
  } catch (error) {
    return {
      status: "failed",
      message: formatLinearTokenError(error, trimmed),
    };
  }
}

export async function verifyGitHubToken(
  token: string,
): Promise<ServiceVerificationResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return {
      status: "failed",
      message: "Enter a GitHub token before verifying.",
    };
  }

  try {
    const metadata = await inspectGitHubTokenMetadata(trimmed);
    const capability = assessClassicPatGuidedCapabilities(metadata);
    if (!capability.ok) {
      return {
        status: "failed",
        message: capability.message,
        limitation: GITHUB_TOKEN_GUIDED_HELPER_TEXT,
      };
    }

    const limitation =
      capability.limitation ??
      (metadata.tokenType === "classic"
        ? "Classic PAT scopes include repo and workflow for the guided setup flow."
        : GITHUB_FINE_GRAINED_STEP1_LIMITATION);

    return {
      status: "connected",
      label: metadata.login,
      message: `Connected as ${metadata.login}.`,
      limitation: `${GITHUB_TOKEN_GUIDED_HELPER_TEXT} ${limitation}`,
    };
  } catch (error) {
    return {
      status: "failed",
      message: formatGitHubTokenError(error, trimmed),
      limitation: GITHUB_TOKEN_GUIDED_HELPER_TEXT,
    };
  }
}

export async function verifyCursorToken(
  token: string,
): Promise<ServiceVerificationResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return {
      status: "failed",
      message: "Enter a Cursor API key before verifying.",
    };
  }

  try {
    const { Cursor } = await import("@cursor/sdk");
    const models = await Cursor.models.list({ apiKey: trimmed });
    const count = models.length;
    let repoHint = "";
    try {
      const repos = await Cursor.repositories.list({ apiKey: trimmed });
      if (repos.length > 0) {
        repoHint = ` ${repos.length} connected repo(s) visible to Cursor.`;
      }
    } catch {
      // repositories.list is optional enrichment only
    }

    return {
      status: "connected",
      label: `${count} model(s)`,
      message: `Cursor API key accepted (${count} model(s) available).${repoHint}`,
      limitation:
        "This confirms the key works with Cursor SDK listing. It does not guarantee a future cloud run can access every target repo.",
    };
  } catch (error) {
    return {
      status: "failed",
      message: formatCursorTokenError(error, trimmed),
      limitation:
        "Cursor verification uses read-only SDK model listing, not a live agent run.",
    };
  }
}

export async function verifyGitHubRepoAccess(input: {
  token: string;
  targetRepo: string;
}): Promise<RepoVerificationResult> {
  const token = input.token.trim();
  const targetRepo = input.targetRepo.trim();

  if (!targetRepo) {
    return {
      status: "failed",
      message: "Enter a GitHub target repo URL before verifying.",
    };
  }

  const parsed = parseTargetRepoUrl(targetRepo);
  if (!parsed) {
    return {
      status: "failed",
      message:
        "Enter a valid GitHub repo URL like https://github.com/acme/my-product.",
    };
  }

  if (!token) {
    return {
      status: "failed",
      message:
        "Add or save a GitHub token first, then verify repo + workflow access.",
    };
  }

  try {
    const metadata = await inspectGitHubTokenMetadata(token);
    if (metadata.tokenType === "classic" && !metadata.hasWorkflowScope) {
      return {
        status: "failed",
        repoSlug: parsed.slug,
        normalizedUrl: parsed.normalizedUrl,
        workflowInstallReady: false,
        message: GITHUB_CLASSIC_PAT_MISSING_WORKFLOW_MESSAGE,
        limitation: GITHUB_TOKEN_GUIDED_HELPER_TEXT,
      };
    }

    const client = new GitHubClient({ token });
    const repository = await client.getRepository(parsed.owner, parsed.repo);
    const canRead =
      repository.permissions?.pull === true ||
      repository.permissions?.push === true ||
      repository.permissions?.admin === true ||
      repository.permissions?.maintain === true;
    const canWriteContents =
      repository.permissions?.push === true ||
      repository.permissions?.admin === true ||
      repository.permissions?.maintain === true;

    if (!canRead) {
      return {
        status: "failed",
        repoSlug: parsed.slug,
        normalizedUrl: parsed.normalizedUrl,
        workflowInstallReady: false,
        message: `GitHub token cannot read ${parsed.slug}. Grant repo read access to this token.`,
      };
    }

    if (!canWriteContents) {
      return {
        status: "failed",
        repoSlug: parsed.slug,
        normalizedUrl: parsed.normalizedUrl,
        workflowInstallReady: false,
        message: `GitHub token cannot write repository contents for ${parsed.slug}. Workflow install PRs need Contents write access. Use a classic PAT with repo + workflow or a fine-grained PAT with Contents write + Workflows write on this repo.`,
      };
    }

    try {
      await client.listActionsWorkflows(parsed.owner, parsed.repo);
    } catch (error) {
      if (error instanceof GitHubApiError && isWorkflowPermissionApiError(error)) {
        return {
          status: "failed",
          repoSlug: parsed.slug,
          normalizedUrl: parsed.normalizedUrl,
          workflowInstallReady: false,
          message: GITHUB_WORKFLOW_SCOPE_SETUP_ERROR,
        };
      }
      if (error instanceof GitHubApiError && error.status === 403) {
        return {
          status: "failed",
          repoSlug: parsed.slug,
          normalizedUrl: parsed.normalizedUrl,
          workflowInstallReady: false,
          message: `GitHub denied Actions workflow access for ${parsed.slug}. Grant Workflows write (fine-grained PAT) or workflow scope (classic PAT), then update GITHUB_TOKEN and verify again.`,
        };
      }
      throw error;
    }

    if (metadata.tokenType === "fine-grained") {
      return {
        status: "connected",
        repoSlug: parsed.slug,
        normalizedUrl: parsed.normalizedUrl,
        workflowInstallReady: true,
        message: `Connected to ${parsed.slug} with repo + workflow install access expected.`,
        limitation: FINE_GRAINED_WORKFLOW_WRITE_LIMITATION,
      };
    }

    return {
      status: "connected",
      repoSlug: parsed.slug,
      normalizedUrl: parsed.normalizedUrl,
      workflowInstallReady: true,
      message: `Connected to ${parsed.slug} with repo + workflow install access.`,
    };
  } catch (error) {
    if (error instanceof GitHubApiError) {
      if (error.status === 404) {
        return {
          status: "failed",
          repoSlug: parsed.slug,
          normalizedUrl: parsed.normalizedUrl,
          workflowInstallReady: false,
          message: `Repo ${parsed.slug} was not found or this token cannot access it.`,
        };
      }
      if (error.status === 401) {
        return {
          status: "failed",
          workflowInstallReady: false,
          message: "GitHub rejected the token. Verify GITHUB_TOKEN and try again.",
        };
      }
      if (error.status === 403) {
        return {
          status: "failed",
          repoSlug: parsed.slug,
          normalizedUrl: parsed.normalizedUrl,
          workflowInstallReady: false,
          message: `GitHub denied access to ${parsed.slug}. Check token permissions for this repo.`,
        };
      }
      return {
        status: "failed",
        workflowInstallReady: false,
        message: sanitizeMessage(
          `GitHub API returned HTTP ${error.status} while checking ${parsed.slug}.`,
          [token],
        ),
      };
    }

    return {
      status: "failed",
      workflowInstallReady: false,
      message: sanitizeMessage(
        error instanceof Error ? error.message : String(error),
        [token],
      ),
    };
  }
}

export async function loadSecretFromEnvLocal(options: {
  cwd?: string;
  key: "LINEAR_API_KEY" | "CURSOR_API_KEY" | "GITHUB_TOKEN";
}): Promise<string | undefined> {
  const paths = resolveLocalFilePaths(options.cwd);
  const existingEnv = await readExistingEnvFile(paths);
  const value = existingEnv?.values[options.key]?.trim();
  return value || undefined;
}

export async function resolveServiceToken(options: {
  cwd?: string;
  service: SetupServiceName;
  token?: string;
}): Promise<{ token?: string; usedSavedKey: boolean }> {
  const trimmed = options.token?.trim();
  if (trimmed) {
    return { token: trimmed, usedSavedKey: false };
  }

  const keyMap: Record<SetupServiceName, "LINEAR_API_KEY" | "CURSOR_API_KEY" | "GITHUB_TOKEN"> = {
    linear: "LINEAR_API_KEY",
    cursor: "CURSOR_API_KEY",
    github: "GITHUB_TOKEN",
  };

  const saved = await loadSecretFromEnvLocal({
    cwd: options.cwd,
    key: keyMap[options.service],
  });

  if (saved) {
    return { token: saved, usedSavedKey: true };
  }

  return { token: undefined, usedSavedKey: false };
}

export async function verifySetupService(options: {
  cwd?: string;
  service: SetupServiceName;
  token?: string;
}): Promise<ServiceVerificationResult & { usedSavedKey?: boolean }> {
  const resolved = await resolveServiceToken(options);

  if (!resolved.token) {
    const labels: Record<SetupServiceName, string> = {
      linear: "LINEAR_API_KEY",
      cursor: "CURSOR_API_KEY",
      github: "GITHUB_TOKEN",
    };
    return {
      status: "failed",
      message: `Enter ${labels[options.service]} or save it in .env.local before verifying.`,
      usedSavedKey: false,
    };
  }

  let result: ServiceVerificationResult;
  switch (options.service) {
    case "linear":
      result = await verifyLinearToken(resolved.token);
      break;
    case "cursor":
      result = await verifyCursorToken(resolved.token);
      break;
    case "github":
      result = await verifyGitHubToken(resolved.token);
      break;
  }

  return {
    ...result,
    usedSavedKey: resolved.usedSavedKey,
  };
}

export async function verifySetupTargetRepo(options: {
  cwd?: string;
  targetRepo: string;
  githubToken?: string;
}): Promise<RepoVerificationResult & { usedSavedGithubToken?: boolean }> {
  const resolved = await resolveServiceToken({
    cwd: options.cwd,
    service: "github",
    token: options.githubToken,
  });

  const result = await verifyGitHubRepoAccess({
    token: resolved.token ?? "",
    targetRepo: options.targetRepo,
  });

  return {
    ...result,
    usedSavedGithubToken: resolved.usedSavedKey,
  };
}

export function normalizeRepoSlugForDisplay(targetRepo: string): string | null {
  return parseGitHubRepoSlug(targetRepo);
}
