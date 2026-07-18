/**
 * Prepared native-skill canary for the final combined remote validation cycle.
 * Default path is dry-run/preflight only — does not create Cloud Agents.
 *
 * Candidate layouts are materialized only inside an isolated disposable fixture
 * workspace, never as production .cursor/skills mirrors.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NATIVE_SKILL_CANARY_CANDIDATE_LAYOUTS } from "../../skills/capability.js";
import { assertNoProductionCursorSkillsMirror } from "../../skills/package.js";

export const NATIVE_SKILL_CANARY_MARKER = "PDEV_NATIVE_SKILL_CANARY_OK" as const;

export type CanaryLayoutId = "agents_skills" | "cursor_skills";

export interface NativeSkillCanaryReport {
  schemaVersion: 1;
  mode: "dry-run" | "live";
  preparedAt: string;
  skillId: string;
  marker: typeof NATIVE_SKILL_CANARY_MARKER;
  fixtureRoot: string | null;
  layoutsPrepared: Array<{
    layoutId: CanaryLayoutId;
    relativePath: string;
    contentSha256: string;
    prepared: boolean;
  }>;
  productionCursorSkillsMirror: { ok: boolean; message: string };
  liveExecution: {
    attempted: boolean;
    blockedReason: string | null;
  };
  /** Provider proof vs model self-report — filled only after live remote cycle */
  evidence: {
    providerProof: null;
    modelSelfReport: null;
    discoveryByLayout: Record<CanaryLayoutId, "pending" | "discovered" | "ignored" | "unavailable">;
    invocationByLayout: Record<CanaryLayoutId, "pending" | "invoked" | "ignored" | "unavailable">;
  };
  notes: string[];
}

function skillBody(skillId: string): string {
  return `---
name: ${skillId}
skillContractVersion: "1"
description: >-
  Disposable canary skill for proving Cloud Agent native skill discovery.
  Not for production use.
---

# ${skillId}

When explicitly requested, output exactly this marker on its own line:

\`${NATIVE_SKILL_CANARY_MARKER}\`

Do not modify repository files. Do not open a pull request.
`;
}

async function prepareLayout(
  fixtureRoot: string,
  layoutId: CanaryLayoutId,
  skillId: string,
): Promise<{ relativePath: string; contentSha256: string }> {
  const relativePath =
    layoutId === "agents_skills"
      ? `.agents/skills/${skillId}/SKILL.md`
      : `.cursor/skills/${skillId}/SKILL.md`;
  const abs = path.join(fixtureRoot, relativePath);
  await mkdir(path.dirname(abs), { recursive: true });
  const body = skillBody(skillId);
  await writeFile(abs, body, "utf8");
  return {
    relativePath,
    contentSha256: createHash("sha256").update(body).digest("hex"),
  };
}

export async function runNativeSkillCanary(params?: {
  live?: boolean;
  keepFixture?: boolean;
  repoRoot?: string;
}): Promise<NativeSkillCanaryReport> {
  const live = params?.live === true;
  const repoRoot = params?.repoRoot ?? process.cwd();
  const skillId = `pdev-native-canary-${randomBytes(4).toString("hex")}`;
  const mirror = await assertNoProductionCursorSkillsMirror(repoRoot);

  if (live) {
    return {
      schemaVersion: 1,
      mode: "live",
      preparedAt: new Date().toISOString(),
      skillId,
      marker: NATIVE_SKILL_CANARY_MARKER,
      fixtureRoot: null,
      layoutsPrepared: [],
      productionCursorSkillsMirror: mirror,
      liveExecution: {
        attempted: false,
        blockedReason:
          "Live Cloud Agent canary is reserved for the final combined remote validation cycle. Re-run with an explicit final-cycle operator procedure; this command refuses live execution in Chunk 3.",
      },
      evidence: {
        providerProof: null,
        modelSelfReport: null,
        discoveryByLayout: {
          agents_skills: "pending",
          cursor_skills: "pending",
        },
        invocationByLayout: {
          agents_skills: "pending",
          cursor_skills: "pending",
        },
      },
      notes: [
        "Live mode refused.",
        ...NATIVE_SKILL_CANARY_CANDIDATE_LAYOUTS.map(
          (l) => `Candidate layout (unproven): ${l}`,
        ),
      ],
    };
  }

  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "pdev-native-skill-canary-"));
  const layouts: CanaryLayoutId[] = ["agents_skills", "cursor_skills"];
  const layoutsPrepared: NativeSkillCanaryReport["layoutsPrepared"] = [];

  try {
    for (const layoutId of layouts) {
      const prepared = await prepareLayout(fixtureRoot, layoutId, skillId);
      layoutsPrepared.push({
        layoutId,
        ...prepared,
        prepared: true,
      });
    }

    // Sanity: fixture files exist and production tree unchanged
    for (const layout of layoutsPrepared) {
      const content = await readFile(
        path.join(fixtureRoot, layout.relativePath),
        "utf8",
      );
      if (!content.includes(NATIVE_SKILL_CANARY_MARKER)) {
        throw new Error(`Fixture missing marker for ${layout.layoutId}`);
      }
    }

    const report: NativeSkillCanaryReport = {
      schemaVersion: 1,
      mode: "dry-run",
      preparedAt: new Date().toISOString(),
      skillId,
      marker: NATIVE_SKILL_CANARY_MARKER,
      fixtureRoot,
      layoutsPrepared,
      productionCursorSkillsMirror: mirror,
      liveExecution: {
        attempted: false,
        blockedReason: null,
      },
      evidence: {
        providerProof: null,
        modelSelfReport: null,
        discoveryByLayout: {
          agents_skills: "pending",
          cursor_skills: "pending",
        },
        invocationByLayout: {
          agents_skills: "pending",
          cursor_skills: "pending",
        },
      },
      notes: [
        "Dry-run/preflight only — no SDK Cloud Agent was created.",
        "Layouts were prepared independently inside a disposable fixture for the final remote cycle to test one-at-a-time.",
        "Model self-report must not be treated as provider proof.",
        "Do not commit fixture layouts into production .cursor/skills.",
        ...NATIVE_SKILL_CANARY_CANDIDATE_LAYOUTS.map(
          (l) => `Candidate layout (unproven): ${l}`,
        ),
      ],
    };

    const reportPath = path.join(fixtureRoot, "native-skill-canary-report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    if (!params?.keepFixture) {
      // Keep report content in return value; remove fixture directory after copy to memory
      await rm(fixtureRoot, { recursive: true, force: true });
      return { ...report, fixtureRoot: null };
    }

    return report;
  } catch (err) {
    if (!params?.keepFixture) {
      await rm(fixtureRoot, { recursive: true, force: true }).catch(() => undefined);
    }
    throw err;
  }
}
