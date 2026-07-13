import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";

vi.mock("../../src/gui/configure-health.js", () => ({
  waitForConfigureServer: vi.fn(async () => undefined),
  checkConfigurePageHealth: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../src/p-dev/next-bin.js", () => ({
  resolveNextBin: vi.fn(() => "/tmp/next"),
}));

import { launchPDev } from "../../src/p-dev/launch.js";

describe("p-dev launch", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "p-dev-launch-"));
    const packageRoot = path.join(tempRoot, "package");
    const guiDir = path.join(packageRoot, "gui");
    const templatesDir = path.join(packageRoot, "templates");

    await mkdir(path.join(templatesDir, ".harness"), { recursive: true });
    await mkdir(guiDir, { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "p-dev-harness", version: "0.3.0" }),
      "utf8",
    );
    await writeFile(
      path.join(templatesDir, ".env.example"),
      "HARNESS_CONFIG_PATH=.harness/config.local.json\n",
      "utf8",
    );
    await writeFile(
      path.join(templatesDir, ".harness", "config.example.json"),
      '{"version":1}\n',
      "utf8",
    );
    await mkdir(path.join(packageRoot, "node_modules", ".bin"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("starts the server, opens the browser, and uses the workspace env", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    const packageRoot = path.join(tempRoot, "package");
    const workspaceDir = path.join(tempRoot, "workspace");
    const modulePath = path.join(packageRoot, "dist", "p-dev", "launch.js");
    await mkdir(path.dirname(modulePath), { recursive: true });

    const openedUrls: string[] = [];
    const child = new EventEmitter() as ChildProcess;
    child.pid = 4242;
    child.kill = vi.fn();
    child.killed = false;
    child.exitCode = null;

    const spawnImpl = vi.fn(() => {
      setTimeout(() => {
        child.emit("exit", 0, null);
      }, 10);
      return child;
    });

    const result = await launchPDev({
      argv: ["--workspace", workspaceDir, "--port", "3000"],
      moduleUrl: `file://${modulePath}`,
      browserOpener: {
        open: async (url: string) => {
          openedUrls.push(url);
        },
      },
      spawnImpl: spawnImpl as never,
    });

    expect(result.url).toBe("http://localhost:3000/settings/configure");
    expect(result.workspaceDir).toBe(workspaceDir);
    expect(openedUrls).toEqual(["http://localhost:3000/settings/configure"]);
    expect(spawnImpl).toHaveBeenCalledOnce();

    const spawnArgs = spawnImpl.mock.calls[0] as [string, string[]];
    expect(spawnArgs[0]).toBe(process.execPath);
    expect(spawnArgs[1]?.[0]).toBe("/tmp/next");
    expect(spawnArgs[1]).toContain("start");

    const spawnOptions = spawnImpl.mock.calls[0]?.[2] as {
      cwd: string;
      env: NodeJS.ProcessEnv;
    };
    expect(spawnOptions.cwd).toBe(path.join(packageRoot, "gui"));
    expect(spawnOptions.env.HARNESS_REPO_ROOT).toBe(workspaceDir);
    expect(spawnOptions.env.P_DEV_HOME).toBe(workspaceDir);
    expect(spawnOptions.env.P_DEV_PACKAGE_VERSION).toBe("0.3.0");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
