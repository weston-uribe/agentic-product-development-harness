import { access } from "node:fs/promises";
import { loadHarnessConfig } from "../config/load-config.js";
import { validateRepoClosure } from "../config/load-config.js";
import type { HarnessConfig } from "../config/types.js";
import { normalizeHarnessEnvPaths } from "../gui/repo-root.js";
import { resolveConfigSource } from "../config/resolve-config.js";
import { resolveHarnessDispatchRepo } from "./harness-dispatch-repo.js";
import { redactKnownSecretValues } from "./redact-secrets.js";
import { summarizeCursorModelSettings } from "./model-settings.js";
import { resolveLocalFilePaths } from "./setup-state.js";
import {
  loadSecretFromEnvLocal,
  verifySetupService,
  verifySetupTargetRepo,
} from "./service-verification.js";

export type LocalReadinessCheckStatus = "passed" | "failed";

export interface LocalReadinessCheckResult {
  id: string;
  label: string;
  status: LocalReadinessCheckStatus;
  detail?: string;
  action?: string;
}

export interface LocalReadinessRunResult {
  checks: LocalReadinessCheckResult[];
  allPassed: boolean;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function redactDetail(message: string, secrets: string[]): string {
  return redactKnownSecretValues(message, secrets);
}

function passed(
  id: string,
  label: string,
  detail?: string,
): LocalReadinessCheckResult {
  return { id, label, status: "passed", detail };
}

function failed(
  id: string,
  label: string,
  detail: string,
  action: string,
  secrets: string[] = [],
): LocalReadinessCheckResult {
  return {
    id,
    label,
    status: "failed",
    detail: redactDetail(detail, secrets),
    action: redactDetail(action, secrets),
  };
}

export async function runLocalReadinessChecks(options?: {
  cwd?: string;
}): Promise<LocalReadinessRunResult> {
  const cwd = options?.cwd ?? process.cwd();
  normalizeHarnessEnvPaths(cwd);
  const paths = resolveLocalFilePaths(cwd);
  const checks: LocalReadinessCheckResult[] = [];
  const secrets: string[] = [];
  for (const key of ["LINEAR_API_KEY", "CURSOR_API_KEY", "GITHUB_TOKEN"] as const) {
    const value = await loadSecretFromEnvLocal({ cwd, key });
    if (value) {
      secrets.push(value);
    }
  }

  const envExists = await fileExists(paths.envLocal);
  const configExists = await fileExists(paths.configLocal);

  let config: HarnessConfig | null = null;
  let configParseError: string | undefined;

  try {
    const loaded = await loadHarnessConfig({ baseDir: cwd });
    config = loaded.config;
  } catch (error) {
    configParseError =
      error instanceof Error ? error.message : String(error);
  }

  if (configParseError) {
    checks.push(
      failed(
        "config-parses",
        "Rechecking generated harness config",
        configParseError,
        "Return to Step 2 and fix .harness/config.local.json, then preview and apply again.",
      ),
    );
  } else if (config) {
    checks.push(
      passed(
        "config-parses",
        "Rechecking generated harness config",
        resolveConfigSource({ baseDir: cwd }).label,
      ),
    );
  } else {
    checks.push(
      failed(
        "config-parses",
        "Rechecking generated harness config",
        "Harness config could not be resolved.",
        "Return to Step 2 and create local setup files again.",
      ),
    );
  }

  if (envExists) {
    checks.push(passed("env-local-exists", ".env.local is present"));
  } else {
    checks.push(
      failed(
        "env-local-exists",
        ".env.local is present",
        "The local environment file is missing.",
        "Return to Step 2 and create local setup files again.",
      ),
    );
  }

  const harnessDispatchRepo = await resolveHarnessDispatchRepo({ cwd });
  if (harnessDispatchRepo.resolved && harnessDispatchRepo.repo) {
    checks.push(
      passed(
        "harness-dispatch-repo-resolved",
        "Harness dispatch repo is resolved",
        harnessDispatchRepo.repo,
      ),
    );
  } else {
    checks.push(
      failed(
        "harness-dispatch-repo-resolved",
        "Harness dispatch repo is resolved",
        harnessDispatchRepo.detail ??
          "Harness dispatch repo could not be resolved from local setup.",
        "Return to Step 4, enter your harness repo, and use Verify and use harness repo.",
      ),
    );
  }

  if (configExists) {
    checks.push(
      passed("config-local-exists", ".harness/config.local.json is present"),
    );
  } else {
    checks.push(
      failed(
        "config-local-exists",
        ".harness/config.local.json is present",
        "The local harness config file is missing.",
        "Return to Step 2 and create local setup files again.",
      ),
    );
  }

  if (config) {
    try {
      validateRepoClosure(config);
      checks.push(
        passed(
          "target-repos-closure",
          "Target repos are allowed in harness config",
        ),
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : String(error);
      checks.push(
        failed(
          "target-repos-closure",
          "Target repos are allowed in harness config",
          detail,
          "Update .harness/config.local.json so allowedTargetRepos includes every configured target repo.",
        ),
      );
    }

    const model = summarizeCursorModelSettings(config);
    checks.push(
      passed(
        "model-policy",
        "Cursor model policy resolves",
        `${model.resolvedModelId} (${model.source})`,
      ),
    );
  }

  const linearResult = await verifySetupService({
    cwd,
    service: "linear",
  });
  if (linearResult.status === "connected") {
    checks.push(
      passed(
        "linear-key",
        "Linear API key works",
        linearResult.label
          ? `Connected as ${linearResult.label}.`
          : linearResult.message,
      ),
    );
  } else {
    checks.push(
      failed(
        "linear-key",
        "Linear API key works",
        linearResult.message,
        "Return to Step 1 and verify your Linear API key, then recreate local setup files if needed.",
        secrets,
      ),
    );
  }

  const cursorResult = await verifySetupService({
    cwd,
    service: "cursor",
  });
  if (cursorResult.status === "connected") {
    checks.push(
      passed(
        "cursor-key",
        "Cursor API key works",
        cursorResult.message,
      ),
    );
  } else {
    checks.push(
      failed(
        "cursor-key",
        "Cursor API key works",
        cursorResult.message,
        "Return to Step 1 and verify your Cursor API key, then recreate local setup files if needed.",
        secrets,
      ),
    );
  }

  const githubResult = await verifySetupService({
    cwd,
    service: "github",
  });
  if (githubResult.status === "connected") {
    const githubDetail = githubResult.label
      ? `Connected as ${githubResult.label}.`
      : githubResult.message;
    checks.push(
      passed(
        "github-token",
        "GitHub token supports guided setup",
        githubResult.limitation
          ? `${githubDetail} ${githubResult.limitation}`
          : githubDetail,
      ),
    );
  } else {
    checks.push(
      failed(
        "github-token",
        "GitHub token supports guided setup",
        githubResult.message,
        "Return to Step 1 and update GITHUB_TOKEN with repo + workflow (classic PAT) or Contents write + Workflows write on target repos (fine-grained PAT), then verify again.",
        secrets,
      ),
    );
  }

  if (config && githubResult.status === "connected") {
    for (const repo of config.repos) {
      const repoResult = await verifySetupTargetRepo({
        cwd,
        targetRepo: repo.targetRepo,
      });
      const slug = repoResult.repoSlug ?? repo.targetRepo;
      if (
        repoResult.status === "connected" &&
        repoResult.workflowInstallReady !== false
      ) {
        const detail = repoResult.limitation
          ? `${repoResult.message} ${repoResult.limitation}`
          : repoResult.message;
        checks.push(
          passed(
            `target-repo-${repo.id}`,
            `Target repo ${slug} supports workflow install`,
            detail,
          ),
        );
      } else {
        checks.push(
          failed(
            `target-repo-${repo.id}`,
            `Target repo ${slug} supports workflow install`,
            repoResult.message,
            "Return to Step 2 and verify repo + workflow access, or update GITHUB_TOKEN in Step 1 with workflow permissions and verify again.",
            secrets,
          ),
        );
      }
    }
  } else if (config && config.repos.length > 0) {
    for (const repo of config.repos) {
      checks.push(
        failed(
          `target-repo-${repo.id}`,
          `Target repo ${repo.targetRepo} supports workflow install`,
          "GitHub token must support guided setup before target repo workflow access can be checked.",
          "Fix your GitHub token in Step 1 first.",
        ),
      );
    }
  }

  const allPassed = checks.every((check) => check.status === "passed");
  return { checks, allPassed };
}
