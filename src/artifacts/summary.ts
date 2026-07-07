import { writeFile } from "node:fs/promises";
import type { RunManifest } from "../types/run.js";
import type { ParsedIssue } from "../types/parsed-issue.js";
import type { ResolvedTarget } from "../resolver/target-repo.js";
import { getSummaryPath } from "./paths.js";

export async function writeRunSummary(
  runDirectory: string,
  manifest: RunManifest,
  parsed: ParsedIssue,
  resolved: ResolvedTarget | null,
): Promise<void> {
  const lines = [
    "# Harness run summary",
    "",
    `- **Run ID:** ${manifest.runId}`,
    `- **Issue:** ${manifest.issueKey}`,
    `- **Milestone:** ${manifest.milestone}`,
    `- **Dry run:** ${manifest.dryRun}`,
    `- **Outcome:** ${manifest.finalOutcome}`,
    `- **Error classification:** ${manifest.errorClassification ?? "none"}`,
    `- **Phase (inferred):** ${manifest.phase}`,
    `- **Status:** ${manifest.phaseInferredFromStatus ?? "unknown"}`,
    `- **Linear status before:** ${manifest.linearStatusBefore ?? "unknown"}`,
    `- **Linear status after:** ${manifest.linearStatusAfter ?? "unknown"}`,
    `- **Model:** ${manifest.model ?? "n/a"}`,
    `- **Prompt version:** ${manifest.promptVersion ?? "n/a"}`,
    `- **Cursor agent ID:** ${manifest.cursorAgentId ?? "n/a"}`,
    `- **Cursor run ID:** ${manifest.cursorRunId ?? "n/a"}`,
    "",
    "## Task",
    parsed.task || "_not parsed_",
    "",
  ];

  if (resolved) {
    lines.push(
      "## Target repo resolution",
      `- **Repo:** ${resolved.targetRepo}`,
      `- **Base branch:** ${resolved.baseBranch}`,
      `- **Config ID:** ${resolved.repoConfigId}`,
      `- **Source:** ${resolved.resolutionSource}`,
      `- **Preview provider:** ${resolved.previewProvider}`,
      "",
    );
  } else {
    lines.push("## Target repo resolution", "_not resolved_", "");
  }

  if (parsed.parseErrors.length > 0) {
    lines.push("## Parse errors", ...parsed.parseErrors.map((e) => `- ${e}`), "");
  }

  lines.push(
    "## Artifacts",
    `- Manifest: \`${runDirectory}/manifest.json\``,
    `- Events: \`${runDirectory}/events.jsonl\``,
    `- Issue snapshot (before): \`${runDirectory}/linear/issue-snapshot-before.json\``,
    `- Issue snapshot (after): \`${runDirectory}/linear/issue-snapshot-after.json\``,
    `- Planning prompt: \`${runDirectory}/prompts/planning-agent.md\``,
    `- Planning result: \`${runDirectory}/outputs/planning-result.md\``,
    `- Cursor run result: \`${runDirectory}/cursor/run-result.json\``,
    `- Comments written: \`${runDirectory}/linear/comments-written.md\``,
    "",
  );

  await writeFile(getSummaryPath(runDirectory), `${lines.join("\n")}\n`, "utf8");
}
