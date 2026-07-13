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
const tarballPath = path.join(packageDir, "p-dev-0.3.0.tgz");

describe("p-dev packed artifact", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "package:p-dev:pack"], {
      cwd: repoRoot,
      stdio: "pipe",
      env: process.env,
    });
  }, 120_000);

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
    expect(listing).not.toMatch(/\.env\.local/);
    expect(listing).not.toMatch(/config\.local\.json/);
    expect(listing).not.toMatch(/\.tgz$/);
  });

  it("declares version 0.3.0 in packed package.json", () => {
    const raw = execFileSync(
      "tar",
      ["-xOf", tarballPath, "package/package.json"],
      { encoding: "utf8" },
    );
    const manifest = JSON.parse(raw) as { version: string; private?: boolean };
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.private).toBeUndefined();
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
