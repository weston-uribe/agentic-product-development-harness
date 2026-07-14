import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveGuiDirectory,
  resolvePackageRootFromModule,
  resolveTemplatesDirectory,
  resolveWorkspaceSnapshotDirectory,
} from "../../src/p-dev/package-paths.js";

describe("p-dev package paths", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "p-dev-package-"));
    await writeFile(
      path.join(tempRoot, "package.json"),
      JSON.stringify({ name: "p-dev-harness" }),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("resolves package, gui, and templates directories from module url", async () => {
    const modulePath = path.join(tempRoot, "dist", "p-dev", "main.js");
    await mkdir(path.dirname(modulePath), { recursive: true });
    await writeFile(modulePath, "export {}", "utf8");

    const packageRoot = resolvePackageRootFromModule(`file://${modulePath}`);
    expect(packageRoot).toBe(tempRoot);
    expect(resolveGuiDirectory(packageRoot)).toBe(path.join(tempRoot, "gui"));
    expect(resolveTemplatesDirectory(packageRoot)).toBe(
      path.join(tempRoot, "templates"),
    );
    expect(resolveWorkspaceSnapshotDirectory(packageRoot)).toBe(
      path.join(tempRoot, "workspace-snapshot"),
    );
  });
});
