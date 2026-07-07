import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LinearIssueSnapshot } from "../linear/client.js";
import type { ParsedIssue } from "../types/parsed-issue.js";
import type { ResolvedTarget } from "../resolver/target-repo.js";
import {
  IMPLEMENTATION_PROMPT_VERSION,
  PLANNING_PROMPT_VERSION,
} from "../config/defaults.js";

const planningTemplatePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "planning.md",
);

const implementationTemplatePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "implementation.md",
);

function formatList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "_none_";
}

export interface BuildImplementationPromptParams {
  issue: LinearIssueSnapshot;
  parsed: ParsedIssue;
  resolved: ResolvedTarget;
  runId: string;
  branchName: string;
  planningCommentBody: string | null;
  validationCommands: string[];
}

export async function buildPlanningPrompt(
  issue: LinearIssueSnapshot,
  parsed: ParsedIssue,
  resolved: ResolvedTarget,
): Promise<{ prompt: string; promptVersion: string }> {
  const template = await readFile(planningTemplatePath, "utf8");
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

export async function buildImplementationPrompt(
  params: BuildImplementationPromptParams,
): Promise<{ prompt: string; promptVersion: string }> {
  const template = await readFile(implementationTemplatePath, "utf8");
  const validationSection = params.parsed.validationExpectations
    ? `### Validation expectations\n\n${params.parsed.validationExpectations}`
    : "";
  const planningComment =
    params.planningCommentBody?.trim() ||
    "_No durable planning comment was found. Proceed only because the issue is narrow and well-scoped._";

  const prompt = template
    .replaceAll("{{promptVersion}}", IMPLEMENTATION_PROMPT_VERSION)
    .replaceAll("{{issueKey}}", params.issue.identifier)
    .replaceAll("{{issueTitle}}", params.issue.title)
    .replaceAll("{{issueUrl}}", params.issue.url ?? "n/a")
    .replaceAll("{{task}}", params.parsed.task)
    .replaceAll("{{acceptanceCriteria}}", formatList(params.parsed.acceptanceCriteria))
    .replaceAll("{{outOfScope}}", formatList(params.parsed.outOfScope))
    .replaceAll("{{validationExpectations}}", validationSection)
    .replaceAll("{{targetRepo}}", params.resolved.targetRepo)
    .replaceAll("{{baseBranch}}", params.resolved.baseBranch)
    .replaceAll("{{branchName}}", params.branchName)
    .replaceAll("{{planningComment}}", planningComment)
    .replaceAll("{{validationCommands}}", formatList(params.validationCommands))
    .replaceAll("{{runId}}", params.runId);

  return { prompt, promptVersion: IMPLEMENTATION_PROMPT_VERSION };
}
