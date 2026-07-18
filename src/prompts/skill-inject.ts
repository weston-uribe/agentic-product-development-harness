import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillInclusionMethod } from "../evaluation/contracts/types.js";
import { PHASE_ELIGIBLE_SKILLS } from "../evaluation/telemetry/provenance.js";

export interface InjectedSkill {
  skillId: string;
  role: string;
  sourcePath: string;
  contentSha256: string;
  skillContractVersion: string | null;
  inclusionMethod: SkillInclusionMethod;
  content: string;
}

export interface SkillInjectionResult {
  prompt: string;
  skillsUsed: InjectedSkill[];
  skillProvenanceStatus: "present" | "none";
}

/**
 * Append canonical skill markdown into a phase prompt as a modular component.
 * Returns skillsUsed=[] / none when the skill file cannot be loaded.
 */
export async function injectPhaseSkills(params: {
  phase: string;
  basePrompt: string;
  repoRoot?: string;
}): Promise<SkillInjectionResult> {
  const eligible = PHASE_ELIGIBLE_SKILLS[params.phase] ?? [];
  if (eligible.length === 0) {
    return {
      prompt: params.basePrompt,
      skillsUsed: [],
      skillProvenanceStatus: "none",
    };
  }

  const root = params.repoRoot ?? process.cwd();
  const skillsUsed: InjectedSkill[] = [];
  const sections: string[] = [];

  for (const item of eligible) {
    const abs = path.isAbsolute(item.sourcePath)
      ? item.sourcePath
      : path.join(root, item.sourcePath);
    try {
      const content = await readFile(abs, "utf8");
      const contentSha256 = createHash("sha256")
        .update(content)
        .digest("hex");
      const versionMatch = content.match(
        /^skillContractVersion:\s*["']?([^\s"']+)/m,
      );
      skillsUsed.push({
        skillId: item.skillId,
        role: item.role,
        sourcePath: item.sourcePath,
        contentSha256,
        skillContractVersion: versionMatch?.[1] ?? null,
        inclusionMethod: "rendered_into_prompt",
        content,
      });
      sections.push(
        [
          "",
          "---",
          "",
          `## Canonical skill: ${item.skillId}`,
          "",
          `Source: \`${item.sourcePath}\``,
          `Role: ${item.role}`,
          `Content SHA-256: ${contentSha256}`,
          "",
          content.trim(),
          "",
        ].join("\n"),
      );
    } catch {
      // Skip missing skills — do not claim inclusion
    }
  }

  if (skillsUsed.length === 0) {
    return {
      prompt: params.basePrompt,
      skillsUsed: [],
      skillProvenanceStatus: "none",
    };
  }

  return {
    prompt: `${params.basePrompt.trimEnd()}\n${sections.join("\n")}`,
    skillsUsed,
    skillProvenanceStatus: "present",
  };
}

export function promptNameForPhase(phase: string): string {
  switch (phase) {
    case "planning":
      return "p-dev.planning";
    case "implementation":
      return "p-dev.implementation";
    case "revision":
      return "p-dev.revision";
    case "integration_repair":
      return "p-dev.integration-repair";
    default:
      return `p-dev.${phase}`;
  }
}
