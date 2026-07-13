import { spawn } from "node:child_process";
import type { BrowserOpener } from "./browser.js";
import { defaultBrowserOpener } from "./browser.js";
import type { PDevCliOptions } from "./cli.js";
import { parsePDevCliOptions } from "./cli.js";
import { assertNodeVersion } from "./node-version.js";
import {
  resolveGuiDirectory,
  resolvePackageRootFromModule,
  resolveTemplatesDirectory,
} from "./package-paths.js";
import { createShutdownController } from "./shutdown.js";
import { resolveNextBin } from "./next-bin.js";
import {
  checkConfigurePageHealth,
  waitForConfigureServer,
} from "../gui/configure-health.js";
import { resolveAvailableGuiPort } from "../gui/port.js";
import {
  P_DEV_PACKAGE_VERSION_ENV,
  readPDevPackageVersionFromPackageRoot,
} from "./package-version.js";
import {
  isPathInsidePackageInstall,
  P_DEV_HOME_ENV,
  resolveWorkspaceDir,
  seedWorkspaceTemplates,
} from "./workspace.js";

export const STARTUP_TIMEOUT_MS = 90_000;

export interface LaunchPDevOptions {
  argv?: string[];
  moduleUrl: string;
  browserOpener?: BrowserOpener;
  spawnImpl?: typeof spawn;
}

export interface LaunchPDevResult {
  url: string;
  workspaceDir: string;
  packageRoot: string;
  port: number;
  host: string;
}

function buildConfigureUrl(host: string, port: number, route: string): string {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `http://${host}:${port}${normalizedRoute}`;
}

export async function launchPDev(
  options: LaunchPDevOptions,
): Promise<LaunchPDevResult> {
  assertNodeVersion();

  const cli = parsePDevCliOptions(options.argv ?? process.argv.slice(2));
  const packageRoot = resolvePackageRootFromModule(options.moduleUrl);
  const guiDir = resolveGuiDirectory(packageRoot);
  const templatesDir = resolveTemplatesDirectory(packageRoot);

  const workspace = resolveWorkspaceDir({
    cliWorkspace: cli.workspace,
    envWorkspace: process.env[P_DEV_HOME_ENV],
  });

  if (isPathInsidePackageInstall(workspace.workspaceDir, packageRoot)) {
    throw new Error(
      `Refusing to use package install directory as workspace (${workspace.workspaceDir}). Set ${P_DEV_HOME_ENV} or pass --workspace to a writable directory outside the installed package.`,
    );
  }

  await seedWorkspaceTemplates({
    workspaceDir: workspace.workspaceDir,
    templatesDir,
  });

  const { host, port, requestedPort } = await resolveAvailableGuiPort({
    host: cli.host,
    port: cli.port,
  });

  const url = buildConfigureUrl(host, port, cli.route);
  const nextBin = resolveNextBin(packageRoot);
  const packagedVersion = readPDevPackageVersionFromPackageRoot(packageRoot);

  const spawnImpl = options.spawnImpl ?? spawn;
  const shutdown = createShutdownController();

  if (port !== requestedPort) {
    console.warn(
      `Port ${requestedPort} was busy. Using ${port} instead. Configure URL: ${url}`,
    );
  }

  console.log(`Starting Product Development Harness Configure GUI at ${url}`);
  console.log(`Operator workspace: ${workspace.workspaceDir}`);

  const child = spawnImpl(
    process.execPath,
    [nextBin, "start", "--hostname", host, "--port", String(port)],
    {
      cwd: guiDir,
      stdio: "inherit",
      env: {
        ...process.env,
        [P_DEV_HOME_ENV]: workspace.workspaceDir,
        HARNESS_REPO_ROOT: workspace.workspaceDir,
        P_DEV_RUNTIME_MODE: "packaged",
        [P_DEV_PACKAGE_VERSION_ENV]: packagedVersion,
        HARNESS_GUI_HOST: host,
        HARNESS_GUI_PORT: String(port),
      },
    },
  );

  shutdown.register(child);

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(`p-dev failed to start Configure GUI: ${error.message}`);
    process.exit(1);
  });

  const baseUrl = `http://${host}:${port}`;
  await waitForConfigureServer(baseUrl, STARTUP_TIMEOUT_MS);
  const health = await checkConfigurePageHealth(url);
  if (!health.ok) {
    await shutdown.cleanup();
    throw new Error(
      health.reason ?? "Configure GUI health check failed after startup.",
    );
  }

  console.log(`Configure GUI is ready at ${url}`);

  if (cli.openBrowser) {
    const browserOpener = options.browserOpener ?? defaultBrowserOpener;
    await browserOpener.open(url);
  }

  await new Promise<void>((resolve, reject) => {
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

  return {
    url,
    workspaceDir: workspace.workspaceDir,
    packageRoot,
    port,
    host,
  };
}

export type { PDevCliOptions };
