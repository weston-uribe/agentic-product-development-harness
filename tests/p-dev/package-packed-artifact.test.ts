import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packageDir = path.join(repoRoot, "packages", "p-dev");
let tarballPath = "";

const GENERATED_PACKAGE_OUTPUT_PREFIXES = [
  "packages/p-dev/bin/",
  "packages/p-dev/dist/",
  "packages/p-dev/gui/",
  "packages/p-dev/templates/",
  "packages/p-dev/workspace-snapshot/",
] as const;

function isIgnorableDirtyPackagePath(filePath: string): boolean {
  return GENERATED_PACKAGE_OUTPUT_PREFIXES.some((prefix) =>
    filePath.startsWith(prefix),
  );
}

function isCleanEnoughForPackagePack(): boolean {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return status
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .every((line) => isIgnorableDirtyPackagePath(line.slice(3).trim()));
}

describe.skipIf(!isCleanEnoughForPackagePack())("p-dev packed artifact", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "package:p-dev:pack"], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    const packageJson = JSON.parse(
      readFileSync(path.join(packageDir, "package.json"), "utf8"),
    ) as { version: string };
    tarballPath = path.join(packageDir, `p-dev-harness-${packageJson.version}.tgz`);
  }, 180_000);

  afterAll(() => {
    // keep tarball for PR validation evidence
  });

  it("includes MIT LICENSE in the packed tarball", () => {
    expect(existsSync(tarballPath)).toBe(true);
    const listing = execFileSync("tar", ["-tzf", tarballPath], {
      encoding: "utf8",
    });
    expect(listing).toContain("package/LICENSE");
    expect(listing).toContain("package/README.md");
    expect(listing).toContain("package/workspace-snapshot/manifest.json");
    expect(listing).toMatch(/package\/workspace-snapshot\/files\/src\//);
    expect(listing).not.toMatch(/\.env\.local/);
    expect(listing).not.toMatch(/config\.local\.json/);
    expect(listing).not.toMatch(/\.tgz$/);
  });

  it("declares the current package version in packed package.json", () => {
    const raw = execFileSync(
      "tar",
      ["-xOf", tarballPath, "package/package.json"],
      { encoding: "utf8" },
    );
    const manifest = JSON.parse(raw) as { version: string; private?: boolean };
    const sourcePackageJson = JSON.parse(
      readFileSync(path.join(packageDir, "package.json"), "utf8"),
    ) as { version: string };
    expect(manifest.version).toBe(sourcePackageJson.version);
    expect(manifest.private).toBeUndefined();
  });

  it("ships a valid workspace snapshot manifest", () => {
    const raw = execFileSync(
      "tar",
      ["-xOf", tarballPath, "package/workspace-snapshot/manifest.json"],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(raw) as {
      snapshotContentId: string;
      snapshotSha256: string;
      fileCount: number;
      files: unknown[];
    };
    expect(parsed.snapshotContentId).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.fileCount).toBeGreaterThan(100);
    expect(parsed.files.length).toBe(parsed.fileCount);
  });

  it("records tarball metadata for release evidence", () => {
    const bytes = readFileSync(tarballPath).byteLength;
    const sha1 = execFileSync("shasum", ["-a", "1", tarballPath], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)[0];
    const sha256 = execFileSync("shasum", ["-a", "256", tarballPath], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)[0];

    expect(bytes).toBeGreaterThan(0);
    expect(sha1).toMatch(/^[a-f0-9]{40}$/);
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
