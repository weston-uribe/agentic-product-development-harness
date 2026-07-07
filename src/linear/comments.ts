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

export interface RevisionCommentFooterInput extends HandoffCommentFooterInput {
  previousHandoffRunId?: string;
  pmFeedbackCommentId?: string;
}

export interface MergeCommentFooterInput extends RevisionCommentFooterInput {
  previousRevisionRunId?: string;
  mergeCommitSha?: string;
  deploymentUrl?: string;
}

export function isHarnessOrchestratorComment(
  commentBody: string,
  orchestratorMarker: string,
): boolean {
  const markers = parseHarnessMarkers(commentBody);
  return (
    markers.orchestratorMarker === orchestratorMarker &&
    Boolean(markers.phase) &&
    Boolean(markers.runId)
  );
}

export function formatHarnessCommentFooter(
  input: MergeCommentFooterInput,
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
  if (input.previousHandoffRunId) {
    lines.push(`previous_handoff_run_id: ${input.previousHandoffRunId}`);
  }
  if (input.pmFeedbackCommentId) {
    lines.push(`pm_feedback_comment_id: ${input.pmFeedbackCommentId}`);
  }
  if (input.previousRevisionRunId) {
    lines.push(`previous_revision_run_id: ${input.previousRevisionRunId}`);
  }
  if (input.mergeCommitSha) {
    lines.push(`merge_commit_sha: ${input.mergeCommitSha}`);
  }
  if (input.deploymentUrl) {
    lines.push(`deployment_url: ${input.deploymentUrl}`);
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

export function hasRevisionCompletionMarker(
  commentBody: string,
  orchestratorMarker: string,
): boolean {
  const markers = parseHarnessMarkers(commentBody);
  return (
    markers.orchestratorMarker === orchestratorMarker &&
    markers.phase === "revision" &&
    Boolean(markers.runId) &&
    Boolean(markers.prUrl) &&
    Boolean(markers.pmFeedbackCommentId)
  );
}

export function findRevisionMarkerForPmFeedback(
  comments: { body: string }[],
  orchestratorMarker: string,
  pmFeedbackCommentId: string,
): boolean {
  return comments.some((comment) => {
    const markers = parseHarnessMarkers(comment.body);
    return (
      markers.orchestratorMarker === orchestratorMarker &&
      markers.phase === "revision" &&
      markers.pmFeedbackCommentId === pmFeedbackCommentId
    );
  });
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

export interface RevisionCommentBodyInput {
  pmFeedback: string;
  prTitle: string;
  prUrl: string;
  branch: string;
  targetRepo: string;
  previewUrl: string | null;
  previewWarning: string | null;
  changedFiles: string[];
  checkSummary: string;
  validationSummary: string;
  harnessRunId: string;
  previousHandoffRunId: string | null;
  pmFeedbackCommentId: string;
}

export function buildRevisionCommentBody(input: RevisionCommentBodyInput): string {
  const lines = [
    "## PM revision",
    "",
    "### PM feedback applied",
    input.pmFeedback.trim(),
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
    lines.push("- _see PR diff_");
  }

  lines.push(
    "",
    "### Checks",
    input.checkSummary,
    "",
    "### Validation",
    input.validationSummary.trim() || "_No validation summary reported._",
    "",
    "### PM review instructions",
    "- Re-review the updated PR diff against the PM feedback above.",
    "- Open the Vercel preview (if present) and spot-check acceptance criteria.",
    "- Do **not** merge from the harness; merge remains a separate human step.",
    "",
    "### Run references",
    `- **Revision run ID:** ${input.harnessRunId}`,
    `- **PM feedback comment ID:** ${input.pmFeedbackCommentId}`,
  );
  if (input.previousHandoffRunId) {
    lines.push(`- **Previous handoff run ID:** ${input.previousHandoffRunId}`);
  }

  return lines.join("\n");
}

export function formatRevisionComment(
  body: string,
  footer: RevisionCommentFooterInput,
): string {
  return `${body.trim()}\n\n${formatHarnessCommentFooter(footer)}`;
}

export function hasMergeCompletionMarker(
  commentBody: string,
  orchestratorMarker: string,
): boolean {
  const markers = parseHarnessMarkers(commentBody);
  return (
    markers.orchestratorMarker === orchestratorMarker &&
    markers.phase === "merge" &&
    Boolean(markers.runId) &&
    Boolean(markers.prUrl)
  );
}

export function findMergeMarkerForPrUrl(
  comments: { body: string }[],
  orchestratorMarker: string,
  prUrl: string,
): boolean {
  const normalized = prUrl.trim().toLowerCase();
  return comments.some((comment) => {
    const markers = parseHarnessMarkers(comment.body);
    return (
      markers.orchestratorMarker === orchestratorMarker &&
      markers.phase === "merge" &&
      Boolean(markers.runId) &&
      markers.prUrl?.trim().toLowerCase() === normalized
    );
  });
}

export interface MergeCompletionCommentBodyInput {
  prTitle: string;
  prUrl: string;
  branch: string;
  targetRepo: string;
  mergeMethod: string;
  mergeCommitSha: string | null;
  mergedAt: string | null;
  baseBranch: string;
  deploymentUrl: string | null;
  deploymentWarning: string | null;
  changedFiles: string[];
  checkSummary: string;
  finalIssueStatus: string;
  harnessRunId: string;
  previousHandoffRunId: string | null;
  previousRevisionRunId: string | null;
}

export function buildMergeCompletionCommentBody(
  input: MergeCompletionCommentBodyInput,
): string {
  const lines = [
    "## PM merge complete",
    "",
    "### PR summary",
    `- **Title:** ${input.prTitle}`,
    `- **URL:** ${input.prUrl}`,
    `- **Branch:** ${input.branch}`,
    `- **Target repo:** ${input.targetRepo}`,
    `- **Merge method:** ${input.mergeMethod}`,
    `- **Base branch:** ${input.baseBranch}`,
  ];

  if (input.mergeCommitSha) {
    lines.push(`- **Merge commit SHA:** ${input.mergeCommitSha}`);
  }
  if (input.mergedAt) {
    lines.push(`- **Merged at:** ${input.mergedAt}`);
  }

  lines.push("", "### Deployment");
  if (input.deploymentUrl) {
    lines.push(`- ${input.deploymentUrl}`);
  } else if (input.deploymentWarning) {
    lines.push(`- ${input.deploymentWarning}`);
  } else {
    lines.push("- _Production deployment URL not captured_");
  }

  lines.push("", "### Changed files");
  const files = input.changedFiles.slice(0, MAX_CHANGED_FILES_IN_COMMENT);
  for (const file of files) {
    lines.push(`- ${file}`);
  }
  if (input.changedFiles.length > MAX_CHANGED_FILES_IN_COMMENT) {
    lines.push(
      `- … and ${input.changedFiles.length - MAX_CHANGED_FILES_IN_COMMENT} more`,
    );
  }
  if (files.length === 0) {
    lines.push("- _see merged PR diff_");
  }

  lines.push(
    "",
    "### Checks",
    input.checkSummary,
    "",
    "### Final status",
    `- **Linear status:** ${input.finalIssueStatus}`,
    "",
    "### Run references",
    `- **Merge run ID:** ${input.harnessRunId}`,
  );
  if (input.previousRevisionRunId) {
    lines.push(`- **Previous revision run ID:** ${input.previousRevisionRunId}`);
  }
  if (input.previousHandoffRunId) {
    lines.push(`- **Previous handoff run ID:** ${input.previousHandoffRunId}`);
  }

  return lines.join("\n");
}

export function formatMergeComment(
  body: string,
  footer: MergeCommentFooterInput,
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
