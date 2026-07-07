import "dotenv/config";
import { access, constants, mkdir } from "node:fs/promises";
import path from "node:path";
import { Cursor } from "@cursor/sdk";
import { loadConfig, validateRepoClosure } from "../../config/load-config.js";
import type { HarnessConfig } from "../../config/types.js";
import { assertBaseBranchExists } from "../../github/base-branch.js";
import { GitHubClient, pingGitHub } from "../../github/client.js";
import { pingLinear } from "../../linear/client.js";
import { EXIT_CONFIG, EXIT_SUCCESS } from "../exit-codes.js";

export interface DoctorOptions {
  configPath: string;
}

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
  skipped?: boolean;
}

export async function runDoctor(options: DoctorOptions): Promise<number> {
  const checks: CheckResult[] = [];
  let config: HarnessConfig | null = null;

  try {
    config = await loadConfig(options.configPath);
    checks.push({
      label: "harness.config.json valid",
      ok: true,
    });

    validateRepoClosure(config);
    checks.push({
      label: "allowedTargetRepos covers all repo mappings",
      ok: true,
    });

    const runsDir = path.resolve(config.logDirectory);
    await mkdir(runsDir, { recursive: true });
    await access(runsDir, constants.W_OK);
    checks.push({
      label: "runs/ directory writable",
      ok: true,
      detail: runsDir,
    });
  } catch (error) {
    checks.push({
      label: "harness.config.json valid",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (process.env.LINEAR_API_KEY) {
    try {
      const name = await pingLinear(process.env.LINEAR_API_KEY);
      checks.push({
        label: "LINEAR_API_KEY set",
        ok: true,
        detail: `authenticated as ${name}`,
      });
    } catch (error) {
      checks.push({
        label: "LINEAR_API_KEY set",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    checks.push({
      label: "LINEAR_API_KEY set",
      ok: false,
      detail: "required for live planning runs",
    });
  }

  if (process.env.CURSOR_API_KEY) {
    checks.push({
      label: "CURSOR_API_KEY set",
      ok: true,
    });

    try {
      const models = await Cursor.models.list({
        apiKey: process.env.CURSOR_API_KEY,
      });
      const count = models.length;
      checks.push({
        label: "Cursor models.list()",
        ok: true,
        detail: `${count} model(s) available`,
      });
    } catch (error) {
      checks.push({
        label: "Cursor models.list()",
        ok: true,
        detail: `warn: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    try {
      const repos = await Cursor.repositories.list({
        apiKey: process.env.CURSOR_API_KEY,
      });
      const count = repos.length;
      checks.push({
        label: "Cursor repositories.list()",
        ok: true,
        detail: `${count} connected repo(s)`,
      });
    } catch (error) {
      checks.push({
        label: "Cursor repositories.list()",
        ok: true,
        detail: `warn: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  } else {
    checks.push({
      label: "CURSOR_API_KEY set",
      ok: false,
      detail: "required for live planning runs",
    });
  }

  if (process.env.GITHUB_TOKEN) {
    try {
      const login = await pingGitHub(process.env.GITHUB_TOKEN);
      checks.push({
        label: "GITHUB_TOKEN set",
        ok: true,
        detail: `authenticated as ${login}`,
      });
    } catch (error) {
      checks.push({
        label: "GITHUB_TOKEN set",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    if (config) {
      const github = new GitHubClient({ token: process.env.GITHUB_TOKEN });
      for (const repo of config.repos) {
        try {
          await assertBaseBranchExists(github, repo.targetRepo, repo.baseBranch);
          checks.push({
            label: `${repo.id} base branch exists`,
            ok: true,
            detail: `${repo.targetRepo}#${repo.baseBranch}`,
          });
        } catch (error) {
          checks.push({
            label: `${repo.id} base branch exists`,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } else {
    checks.push({
      label: "GITHUB_TOKEN set",
      ok: false,
      detail: "required for handoff runs (Milestone 4+)",
    });
  }

  for (const check of checks) {
    const icon = check.skipped ? "○" : check.ok ? "✓" : "✗";
    const suffix = check.detail ? ` — ${check.detail}` : "";
    console.log(`${icon} ${check.label}${suffix}`);
  }

  const failed = checks.some((check) => !check.ok && !check.skipped);
  return failed ? EXIT_CONFIG : EXIT_SUCCESS;
}
