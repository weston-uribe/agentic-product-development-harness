#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAvailableGuiPort } from "./port.js";

import { resolveHarnessRepoRoot } from "./repo-root.js";

interface CliOptions {
  port?: number;
  host?: string;
  route?: string;
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--port") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--port requires a number");
      }
      options.port = Number.parseInt(value, 10);
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      options.port = Number.parseInt(arg.slice("--port=".length), 10);
      continue;
    }

    if (arg === "--host") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      options.host = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
      continue;
    }

    if (arg === "--route") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--route requires a path");
      }
      options.route = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--route=")) {
      options.route = arg.slice("--route=".length);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));
  const { host, port } = await resolveAvailableGuiPort({
    host: cli.host,
    port: cli.port,
  });

  const repoRoot = resolveHarnessRepoRoot(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  );
  const guiDir = path.join(repoRoot, "apps", "gui");
  const route = cli.route ?? "/settings/configure";
  const url = `http://${host}:${port}${route}`;

  console.log(`Starting Product Development Harness GUI at ${url}`);

  const nextBin = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next",
  );

  const child = spawn(
    nextBin,
    ["dev", "--hostname", host, "--port", String(port)],
    {
      cwd: guiDir,
      stdio: "inherit",
      env: {
        ...process.env,
        HARNESS_REPO_ROOT: repoRoot,
        HARNESS_GUI_HOST: host,
        HARNESS_GUI_PORT: String(port),
      },
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`harness:gui failed: ${message}`);
  process.exit(1);
});
