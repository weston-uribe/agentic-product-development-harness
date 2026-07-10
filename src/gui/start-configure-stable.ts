#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_CONFIGURE_URL,
  checkConfigurePageHealth,
  waitForConfigureServer,
} from "./configure-health.js";
import {
  STABLE_GUI_HOST,
  STABLE_GUI_PORT,
  assertStableGuiPortAvailable,
  cleanGuiNextCache,
  stopChildProcess,
  stopStaleGuiServers,
} from "./dev-server-process.js";
import { resolveHarnessRepoRoot } from "./repo-root.js";

const STARTUP_TIMEOUT_MS = 90_000;

async function main(): Promise<void> {
  const repoRoot = resolveHarnessRepoRoot(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  );
  const guiDir = path.join(repoRoot, "apps", "gui");
  const baseUrl = `http://${STABLE_GUI_HOST}:${STABLE_GUI_PORT}`;

  console.log("Preparing stable Configure GUI dev server…");
  const stopped = await stopStaleGuiServers();
  if (stopped.stopped.length > 0) {
    for (const entry of stopped.stopped) {
      console.log(
        `Stopped stale GUI dev server on port ${entry.port} (PID ${entry.pid}).`,
      );
    }
  }

  await assertStableGuiPortAvailable(STABLE_GUI_PORT, STABLE_GUI_HOST);

  let cleanedCache = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const child = spawnNextDev(repoRoot, guiDir);
    try {
      await waitForConfigureServer(baseUrl, STARTUP_TIMEOUT_MS);
      const health = await checkConfigurePageHealth(CANONICAL_CONFIGURE_URL);
      if (health.ok) {
        printReadyBanner();
        await waitForExit(child);
        return;
      }

      console.error(
        `Configure GUI health check failed: ${health.reason ?? "unknown error"}`,
      );
    } finally {
      await stopChildProcess(child);
    }

    if (attempt === 0) {
      const nextDir = await cleanGuiNextCache(repoRoot);
      cleanedCache = true;
      console.log(`Cleaned safe GUI cache: ${nextDir}`);
      console.log("Restarting Configure GUI once after cache cleanup…");
      continue;
    }

    throw new Error(
      cleanedCache
        ? "Configure GUI still failed the styling health check after cleaning apps/gui/.next."
        : "Configure GUI failed the styling health check.",
    );
  }
}

function spawnNextDev(repoRoot: string, guiDir: string) {
  const nextBin = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next",
  );

  console.log(
    `Starting Configure GUI at http://${STABLE_GUI_HOST}:${STABLE_GUI_PORT}/settings/configure`,
  );

  return spawn(
    nextBin,
    ["dev", "--hostname", STABLE_GUI_HOST, "--port", String(STABLE_GUI_PORT)],
    {
      cwd: guiDir,
      stdio: "inherit",
      env: {
        ...process.env,
        HARNESS_REPO_ROOT: repoRoot,
        HARNESS_GUI_HOST: STABLE_GUI_HOST,
        HARNESS_GUI_PORT: String(STABLE_GUI_PORT),
      },
    },
  );
}

function printReadyBanner(): void {
  console.log("");
  console.log("Configure GUI is ready.");
  console.log(`Canonical URL: ${CANONICAL_CONFIGURE_URL}`);
  console.log(
    "Use this URL in your own terminal session. localhost and 127.0.0.1 are equivalent loopback hosts; this harness uses localhost:3000 as the operator convention.",
  );
  console.log(
    "If the page looks unstyled, stop the server and run npm run harness:configure:stable again to clean apps/gui/.next and restart.",
  );
  console.log("");
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Configure GUI exited from signal ${signal}`));
        return;
      }
      if (code && code !== 0) {
        reject(new Error(`Configure GUI exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`harness:configure:stable failed: ${message}`);
  process.exit(1);
});
