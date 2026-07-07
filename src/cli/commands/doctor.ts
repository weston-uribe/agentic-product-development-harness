import { access, constants, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig, validateRepoClosure } from "../../config/load-config.js";
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

  try {
    const config = await loadConfig(options.configPath);
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
      ok: true,
      detail: "optional — warn: not set (fixture dry-run does not require it)",
      skipped: false,
    });
  }

  checks.push({
    label: "CURSOR_API_KEY",
    ok: true,
    skipped: true,
    detail: "skipped (Milestone 2)",
  });
  checks.push({
    label: "GITHUB_TOKEN",
    ok: true,
    skipped: true,
    detail: "skipped (Milestone 2)",
  });

  for (const check of checks) {
    const icon = check.skipped ? "○" : check.ok ? "✓" : "✗";
    const suffix = check.detail ? ` — ${check.detail}` : "";
    console.log(`${icon} ${check.label}${suffix}`);
  }

  const failed = checks.some((check) => !check.ok && !check.skipped);
  return failed ? EXIT_CONFIG : EXIT_SUCCESS;
}
