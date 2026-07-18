import { describe, expect, it, vi } from "vitest";
import { parseSourceGuiCliOptions } from "../../src/gui/source-cli.js";
import { launchSourceGui } from "../../src/gui/launch-source-gui.js";
import * as existingServer from "../../src/gui/existing-server.js";

describe("launch-source-gui", () => {
  it("defaults to opening / and rejects --route", () => {
    const cli = parseSourceGuiCliOptions(["--no-open"]);
    expect(cli.openBrowser).toBe(false);
    expect(() => parseSourceGuiCliOptions(["--route", "/settings/configure"])).toThrow(
      "no longer accepts --route",
    );
  });

  it("requires bootstrap-provided workspace env", async () => {
    const previousRepo = process.env.HARNESS_REPO_ROOT;
    const previousHome = process.env.P_DEV_HOME;
    delete process.env.HARNESS_REPO_ROOT;
    delete process.env.P_DEV_HOME;
    try {
      await expect(launchSourceGui({ argv: ["--no-open"] })).rejects.toThrow(
        "HARNESS_REPO_ROOT is required",
      );
    } finally {
      if (previousRepo === undefined) {
        delete process.env.HARNESS_REPO_ROOT;
      } else {
        process.env.HARNESS_REPO_ROOT = previousRepo;
      }
      if (previousHome === undefined) {
        delete process.env.P_DEV_HOME;
      } else {
        process.env.P_DEV_HOME = previousHome;
      }
    }
  });

  it("reuses an existing registered server without spawning next dev", async () => {
    const previousRepo = process.env.HARNESS_REPO_ROOT;
    const previousHome = process.env.P_DEV_HOME;
    process.env.HARNESS_REPO_ROOT = "/src";
    process.env.P_DEV_HOME = "/workspace";

    const browserOpener = { open: vi.fn(async () => undefined) };
    const spawnImpl = vi.fn();
    const findSpy = vi.spyOn(existingServer, "findReusableRegisteredServer").mockResolvedValue({
      record: {
        schemaVersion: 1,
        instanceId: "reuse",
        sourceRoot: "/src",
        workspaceDir: "/workspace",
        host: "localhost",
        port: 3001,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
      url: "http://localhost:3001/",
    });

    try {
      await launchSourceGui({
        argv: ["--no-open"],
        browserOpener,
        spawnImpl,
      });
      expect(spawnImpl).not.toHaveBeenCalled();
    } finally {
      findSpy.mockRestore();
      if (previousRepo === undefined) {
        delete process.env.HARNESS_REPO_ROOT;
      } else {
        process.env.HARNESS_REPO_ROOT = previousRepo;
      }
      if (previousHome === undefined) {
        delete process.env.P_DEV_HOME;
      } else {
        process.env.P_DEV_HOME = previousHome;
      }
    }
  });
});
