import { describe, expect, it } from "vitest";
import {
  NATIVE_SKILL_CANARY_MARKER,
  runNativeSkillCanary,
} from "../../src/evaluation/native-skill-canary/run.js";
import { existsSync } from "node:fs";
import path from "node:path";

describe("native skill canary preflight", () => {
  it("prepares isolated layouts and cleans up by default", async () => {
    const report = await runNativeSkillCanary();
    expect(report.mode).toBe("dry-run");
    expect(report.marker).toBe(NATIVE_SKILL_CANARY_MARKER);
    expect(report.layoutsPrepared).toHaveLength(2);
    expect(report.layoutsPrepared.map((l) => l.layoutId).sort()).toEqual([
      "agents_skills",
      "cursor_skills",
    ]);
    expect(report.fixtureRoot).toBeNull();
    expect(report.liveExecution.attempted).toBe(false);
    expect(report.productionCursorSkillsMirror.ok).toBe(true);
    expect(report.evidence.providerProof).toBeNull();
    expect(report.evidence.modelSelfReport).toBeNull();
    // Production tree must not gain .cursor/skills from canary
    expect(existsSync(path.join(process.cwd(), ".cursor", "skills"))).toBe(false);
  });

  it("refuses live execution", async () => {
    const report = await runNativeSkillCanary({ live: true });
    expect(report.mode).toBe("live");
    expect(report.liveExecution.attempted).toBe(false);
    expect(report.liveExecution.blockedReason).toMatch(/refuses live/);
    expect(report.layoutsPrepared).toHaveLength(0);
  });
});
