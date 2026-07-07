import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseHarnessMarkers } from "./markers.js";

export interface HarnessCommentFooterInput {
  orchestratorMarker: string;
  phase: string;
  runId: string;
  cursorAgentId?: string;
  cursorRunId?: string;
  model: string;
  promptVersion: string;
  targetRepo: string;
}

export interface ImplementationCommentFooterInput
  extends HarnessCommentFooterInput {
  branch?: string;
  prUrl?: string;
}

export interface HandoffCommentFooterInput extends ImplementationCommentFooterInput {
  previewUrl?: string;
  previousImplementationRunId?: string;
}

export function formatHarnessCommentFooter(
  input: HandoffCommentFooterInput,
): string {
  const lines = [
    "---",
    input.orchestratorMarker,
    `phase: ${input.phase}`,
    `run_id: ${input.runId}`,
  ];
  if (input.cursorAgentId) {
    lines.push(`cursor_agent_id: ${input.cursorAgentId}`);
  }
  if (input.cursorRunId) {
    lines.push(`cursor_run_id: ${input.cursorRunId}`);
  }
  lines.push(
    `model: ${input.model}`,
    `prompt_version: ${input.promptVersion}`,
    `target_repo: ${input.targetRepo}`,
  );
  if (input.branch) {
    lines.push(`branch: ${input.branch}`);
  }
  if (input.prUrl) {
    lines.push(`pr_url: ${input.prUrl}`);
  }
  if (input.previewUrl) {
    lines.push(`preview_url: ${input.previewUrl}`);
  }
  if (input.previousImplementationRunId) {
    lines.push(
      `previous_implementation_run_id: ${input.previousImplementationRunId}`,
    );
  }
  lines.push("---");
  return lines.join("\n");
}

export function formatPlanningComment(
  planBody: string,
  footer: HarnessCommentFooterInput,
): string {
  const trimmed = planBody.trim();
  const header = trimmed.startsWith("##")
    ? trimmed
    : `## Implementation plan\n\n${trimmed}`;
  return `${header}\n\n${formatHarnessCommentFooter(footer)}`;
}

export function hasPlanningCompletionMarker(
  commentBody: string,
  orchestratorMarker: string,
): boolean {
  const markers = parseHarnessMarkers(commentBody);
  return (
    markers.orchestratorMarker === orchestratorMarker &&
    markers.phase === "planning" &&
    Boolean(markers.runId)
  );
}

export function formatImplementationComment(
  summaryBody: string,
  footer: ImplementationCommentFooterInput,
): string {
  const trimmed = summaryBody.trim();
  const header = trimmed.startsWith("##")
    ? trimmed
    : `## Implementation summary\n\n${trimmed}`;
  return `${header}\n\n${formatHarnessCommentFooter(footer)}`;
}

export function hasImplementationCompletionMarker(
  commentBody: string,
  orchestratorMarker: string,
): boolean {
  const markers = parseHarnessMarkers(commentBody);
  return (
    markers.orchestratorMarker === orchestratorMarker &&
    markers.phase === "implementation" &&
    Boolean(markers.runId) &&
    Boolean(markers.prUrl)
  );
}

export function hasHandoffCompletionMarker(
  commentBody: string,
  orchestratorMarker: string,
): boolean {
  const markers = parseHarnessMarkers(commentBody);
  return (
    markers.orchestratorMarker === orchestratorMarker &&
    markers.phase === "handoff" &&
    Boolean(markers.runId) &&
    Boolean(markers.prUrl)
  );
}

const MAX_CHANGED_FILES_IN_COMMENT = 30;

export interface HandoffCommentBodyInput {
  prTitle: string;
  prUrl: string;
  branch: string;
  targetRepo: string;
  previewUrl: string | null;
  previewWarning: string | null;
  changedFiles: string[];
  checkSummary: string;
  harnessRunId: string;
  previousImplementationRunId: string | null;
}

export function buildHandoffCommentBody(input: HandoffCommentBodyInput): string {
  const lines = [
    "## PM handoff",
    "",
    "### PR summary",
    `- **Title:** ${input.prTitle}`,
    `- **URL:** ${input.prUrl}`,
    `- **Branch:** ${input.branch}`,
    `- **Target repo:** ${input.targetRepo}`,
    "",
  ];

  if (input.previewUrl) {
    lines.push("### Preview", `- ${input.previewUrl}`, "");
  } else if (input.previewWarning) {
    lines.push("### Preview", `- ${input.previewWarning}`, "");
  }

  lines.push("### Changed files");
  const files = input.changedFiles.slice(0, MAX_CHANGED_FILES_IN_COMMENT);
  for (const file of files) {
    lines.push(`- ${file}`);
  }
  if (input.changedFiles.length > MAX_CHANGED_FILES_IN_COMMENT) {
    lines.push(
      `- … and ${input.changedFiles.length - MAX_CHANGED_FILES_IN_COMMENT} more (see github/pr.json)`,
    );
  }
  if (files.length === 0) {
    lines.push("- _none reported_");
  }

  lines.push(
    "",
    "### Checks",
    input.checkSummary,
    "",
    "### PM review instructions",
    "- Review the PR diff and changed files above.",
    "- Open the Vercel preview (if present) and spot-check acceptance criteria.",
    "- Do **not** merge from the harness; merge remains a separate human step.",
    "- To request changes, use the revision workflow (manual in this milestone).",
    "- Reference acceptance criteria in the Linear issue description.",
    "",
    "### Run references",
    `- **Handoff run ID:** ${input.harnessRunId}`,
  );
  if (input.previousImplementationRunId) {
    lines.push(
      `- **Previous implementation run ID:** ${input.previousImplementationRunId}`,
    );
  }

  return lines.join("\n");
}

export function formatHandoffComment(
  body: string,
  footer: HandoffCommentFooterInput,
): string {
  return `${body.trim()}\n\n${formatHarnessCommentFooter(footer)}`;
}

export async function writeCommentsArtifact(
  runDirectory: string,
  comments: string[],
): Promise<void> {
  const filePath = path.join(runDirectory, "linear", "comments-written.md");
  await mkdir(path.dirname(filePath), { recursive: true });
  const content = comments.map((c, i) => `## Comment ${i + 1}\n\n${c}`).join("\n\n");
  await writeFile(filePath, `${content}\n`, "utf8");
}
