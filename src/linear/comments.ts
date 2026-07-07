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

export function formatHarnessCommentFooter(
  input: ImplementationCommentFooterInput,
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

export async function writeCommentsArtifact(
  runDirectory: string,
  comments: string[],
): Promise<void> {
  const filePath = path.join(runDirectory, "linear", "comments-written.md");
  await mkdir(path.dirname(filePath), { recursive: true });
  const content = comments.map((c, i) => `## Comment ${i + 1}\n\n${c}`).join("\n\n");
  await writeFile(filePath, `${content}\n`, "utf8");
}
