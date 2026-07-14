import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveObservabilityPublicConfigForPrepare } from "../../src/observability/package-config.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("observability packaged config", () => {
  it("matches tracked source config bytes", () => {
    const tracked = resolveObservabilityPublicConfigForPrepare(repoRoot);
    const packaged = JSON.parse(
      readFileSync(
        path.join(repoRoot, "packages/p-dev/observability.public.json"),
        "utf8",
      ),
    );
    expect(packaged).toEqual(tracked);
    expect(JSON.stringify(packaged)).not.toMatch(/phx_/i);
    expect(JSON.stringify(packaged)).not.toMatch(/authToken/i);
    expect(tracked.sentryPublicDsn).toBe("");
    expect(tracked.posthogProjectToken).toBe("");
  });
});
