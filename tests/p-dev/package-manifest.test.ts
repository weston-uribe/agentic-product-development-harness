import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("p-dev package manifest", () => {
  it("declares the unpublished spike package metadata", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "packages/p-dev/package.json"), "utf8"),
    ) as {
      name: string;
      private: boolean;
      bin: Record<string, string>;
      engines: { node: string };
      files: string[];
    };

    expect(manifest.name).toBe("p-dev");
    expect(manifest.private).toBe(true);
    expect(manifest.bin["p-dev"]).toBe("./bin/p-dev.js");
    expect(manifest.engines.node).toBe(">=22");
    expect(manifest.files).toEqual(
      expect.arrayContaining(["bin", "dist", "gui", "templates"]),
    );
  });
});
