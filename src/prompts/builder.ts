import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LinearIssueSnapshot } from "../linear/client.js";
import type { ParsedIssue } from "../types/parsed-issue.js";
import type { ResolvedTarget } from "../resolver/target-repo.js";
import { PLANNING_PROMPT_VERSION } from "../config/defaults.js";

const templatePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "planning.md",
);

function formatList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export async function buildPlanningPrompt(
  issue: LinearIssueSnapshot,
  parsed: ParsedIssue,
  resolved: ResolvedTarget,
): Promise<{ prompt: string; promptVersion: string }> {
  const template = await readFile(templatePath, "utf8");
  const validationSection = parsed.validationExpectations
    ? `### Validation expectations\n\n${parsed.validationExpectations}`
    : "";

  const prompt = template
    .replaceAll("{{promptVersion}}", PLANNING_PROMPT_VERSION)
    .replaceAll("{{issueKey}}", issue.identifier)
    .replaceAll("{{issueTitle}}", issue.title)
    .replaceAll("{{task}}", parsed.task)
    .replaceAll("{{acceptanceCriteria}}", formatList(parsed.acceptanceCriteria))
    .replaceAll("{{outOfScope}}", formatList(parsed.outOfScope))
    .replaceAll("{{validationExpectations}}", validationSection)
    .replaceAll("{{targetRepo}}", resolved.targetRepo)
    .replaceAll("{{baseBranch}}", resolved.baseBranch);

  return { prompt, promptVersion: PLANNING_PROMPT_VERSION };
}
