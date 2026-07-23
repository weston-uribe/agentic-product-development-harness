import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PRODUCTION_LAUNCH_SURFACES,
  PRODUCTION_WRAPPER_SURFACE_UNION,
  launchSurfacesManifestDigest,
} from "../../src/provenance/launch-surfaces.js";
import { createPlanningCloudAgent } from "../../src/cursor/agent-factory.js";
import { InMemoryProvenanceEventStore } from "../../src/provenance/store.js";

const PHASE_DIR = path.resolve("src/runner/phases");
const PRODUCTION_PHASE_FILES = [
  "planning.ts",
  "plan-review.ts",
  "implementation.ts",
  "code-review.ts",
  "code-revision.ts",
  "revision.ts",
  "integration-repair.ts",
];

describe("production provenance boundary", () => {
  it("manifest matches production wrapper surface union", () => {
    expect([...PRODUCTION_LAUNCH_SURFACES].sort()).toEqual(
      [...PRODUCTION_WRAPPER_SURFACE_UNION].sort(),
    );
    expect(launchSurfacesManifestDigest()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("production phase modules import agents/production not generic index create/acquire", () => {
    for (const file of PRODUCTION_PHASE_FILES) {
      const src = readFileSync(path.join(PHASE_DIR, file), "utf8");
      expect(src).toContain('from "../../agents/production.js"');
      expect(src).not.toMatch(
        /from ["']\.\.\/\.\.\/agents\/index\.js["']/,
      );
      expect(src).not.toContain("agent-factory");
      expect(src).not.toContain("cursor-provider");
    }
  });

  it("generic agent factory create path does not import provenance writer", () => {
    const factory = readFileSync("src/cursor/agent-factory.ts", "utf8");
    expect(factory).not.toContain("provenance");
    expect(typeof createPlanningCloudAgent).toBe("function");
  });

  it("native-skill canary does not import provenance modules", () => {
    const canary = readFileSync(
      "src/evaluation/native-skill-canary/run.ts",
      "utf8",
    );
    expect(canary).not.toContain("src/provenance");
    expect(canary).not.toContain("linear-harness-provider");
  });

  it("sdk usage probe does not import provenance modules", () => {
    const probe = readFileSync(
      "src/evaluation/cursor-sdk-usage-probe/run.ts",
      "utf8",
    );
    expect(probe).not.toContain("src/provenance");
    expect(probe).not.toContain("linear-harness-provider");
  });

  it("in-memory store starts empty (no live state writes)", () => {
    const store = new InMemoryProvenanceEventStore();
    expect(store.listEvents()).toEqual([]);
  });

  it("phase directory still contains only known production launch files", () => {
    const files = readdirSync(PHASE_DIR).filter((f) => f.endsWith(".ts"));
    for (const required of PRODUCTION_PHASE_FILES) {
      expect(files).toContain(required);
    }
  });
});
