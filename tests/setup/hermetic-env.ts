/**
 * Hermetic Vitest bootstrap: isolate HOME / P_DEV_HOME / TMPDIR and restore
 * harness-critical environment keys between tests so inherited live operator
 * state cannot silently redirect the suite.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { vi } from "vitest";

/** Captured before hermetic TMPDIR override so tests can allocate truly external paths. */
export const OS_TMPDIR = (() => {
  try {
    return realpathSync(tmpdir());
  } catch {
    return path.resolve(tmpdir());
  }
})();

export const HARNESS_TEST_ENV_KEYS = [
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "P_DEV_HOME",
  "HARNESS_REPO_ROOT",
  "HARNESS_CONFIG_PATH",
  "HARNESS_CONFIG_JSON",
  "HARNESS_CONFIG_JSON_B64",
  "P_DEV_WORKFLOW_STATE_STORE_MODE",
  "P_DEV_RUNTIME_MODE",
  "P_DEV_PACKAGE_VERSION",
  "P_DEV_PACKAGE_ROOT",
  "LINEAR_API_KEY",
  "LINEAR_WEBHOOK_SECRET",
  "CURSOR_API_KEY",
  "GITHUB_TOKEN",
  "GITHUB_DISPATCH_TOKEN",
  "HARNESS_GITHUB_TOKEN",
  "VERCEL_TOKEN",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_HOST",
  "HARNESS_GUI_PORT",
  "HARNESS_GUI_HOST",
  "HARNESS_VITEST_PROVISIONING_MOCK",
  "HARNESS_VITEST_REMOTE_SETUP_MOCK",
  "HARNESS_VITEST_TARGET_REPO_PROVISIONING_MOCK",
  "HARNESS_VITEST_RUNNER_UPGRADE_MOCK",
] as const;

export type HarnessTestEnvKey = (typeof HARNESS_TEST_ENV_KEYS)[number];

type EnvSnapshot = Map<string, string | undefined>;

let workerHome: string | undefined;
let workerTmp: string | undefined;
let workerPDevHome: string | undefined;
let baselineSnapshot: EnvSnapshot | undefined;
const initialCwd = process.cwd();

function snapshotKeys(keys: readonly string[]): EnvSnapshot {
  const snap: EnvSnapshot = new Map();
  for (const key of keys) {
    snap.set(key, process.env[key]);
  }
  return snap;
}

function restoreKeys(snap: EnvSnapshot): void {
  for (const [key, value] of snap) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/**
 * Clear inherited live config paths that point outside the hermetic worker tree.
 * Returns the cleared path when one was removed.
 */
export function clearInheritedLiveConfigPath(workerRoot: string): string | undefined {
  const raw = process.env.HARNESS_CONFIG_PATH?.trim();
  if (!raw) {
    return undefined;
  }
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(process.cwd(), raw);
  const root = path.resolve(workerRoot);
  if (resolved === root || resolved.startsWith(root + path.sep)) {
    return undefined;
  }
  delete process.env.HARNESS_CONFIG_PATH;
  return resolved;
}

/**
 * Apply a temporary env overlay for one callback, then restore the previous values.
 */
export async function withTestEnv<T>(
  vars: Partial<Record<string, string | undefined>>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const keys = Object.keys(vars);
  const previous = snapshotKeys(keys);
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return await fn();
  } finally {
    restoreKeys(previous);
  }
}

export function getHermeticWorkerPaths(): {
  home: string;
  tmp: string;
  pDevHome: string;
} {
  if (!workerHome || !workerTmp || !workerPDevHome) {
    throw new Error("Hermetic worker paths are not initialized");
  }
  return { home: workerHome, tmp: workerTmp, pDevHome: workerPDevHome };
}

beforeAll(() => {
  if (process.env.P_DEV_TEST_ALLOW_REAL_HOME === "1") {
    baselineSnapshot = snapshotKeys(HARNESS_TEST_ENV_KEYS);
    return;
  }

  workerHome = realpathSync(mkdtempSync(path.join(OS_TMPDIR, "p-dev-test-home-")));
  workerTmp = path.join(workerHome, "tmp");
  workerPDevHome = path.join(workerHome, "workspace");
  mkdirSync(workerTmp, { recursive: true });
  mkdirSync(workerPDevHome, { recursive: true });

  process.env.HOME = workerHome;
  process.env.TMPDIR = workerTmp;
  process.env.TMP = workerTmp;
  process.env.TEMP = workerTmp;
  process.env.P_DEV_HOME = workerPDevHome;

  clearInheritedLiveConfigPath(workerHome);

  // Strip inherited live credentials and config so tests must supply fixtures.
  for (const key of HARNESS_TEST_ENV_KEYS) {
    if (
      key === "HOME" ||
      key === "TMPDIR" ||
      key === "TMP" ||
      key === "TEMP" ||
      key === "P_DEV_HOME"
    ) {
      continue;
    }
    delete process.env[key];
  }

  baselineSnapshot = snapshotKeys(HARNESS_TEST_ENV_KEYS);
});

beforeEach(() => {
  if (!baselineSnapshot) {
    return;
  }
  restoreKeys(baselineSnapshot);
  if (workerHome) {
    clearInheritedLiveConfigPath(workerHome);
  }
});

afterEach(() => {
  if (baselineSnapshot) {
    restoreKeys(baselineSnapshot);
  }
  vi.unstubAllGlobals();
  if (process.cwd() !== initialCwd) {
    process.chdir(initialCwd);
  }
});

afterAll(() => {
  if (process.env.P_DEV_TEST_ALLOW_REAL_HOME === "1") {
    return;
  }
  if (workerHome) {
    rmSync(workerHome, { recursive: true, force: true });
  }
});
