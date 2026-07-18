import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";

/**
 * Proves rubric definitions are loadable from compiled dist after build:tsc.
 * Run: npm run build:tsc && npx vitest run tests/evaluation/rubrics-built-runtime.test.ts
 */
describe("built-runtime rubric loading", () => {
  it("loads all rubrics from dist after copy:eval-assets", async () => {
    const distLoad = path.resolve(
      process.cwd(),
      "dist/evaluation/rubrics/load.js",
    );
    const distDefinitions = path.resolve(
      process.cwd(),
      "dist/evaluation/rubrics/definitions/implementation-quality.v1.json",
    );

    try {
      await access(distLoad);
      await access(distDefinitions);
    } catch {
      throw new Error(
        "dist rubric assets missing; run `npm run build:tsc` before this test",
      );
    }

    const mod = await import(pathToFileURL(distLoad).href);
    const rubrics = await mod.loadAllRubrics();
    expect(rubrics.length).toBe(4);
    expect(rubrics.map((r: { rubricId: string }) => r.rubricId).sort()).toEqual([
      "implementation-quality",
      "planning-quality",
      "revision-quality",
      "workflow-quality",
    ]);
  });
});
