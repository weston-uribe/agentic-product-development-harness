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
    "",
  );

  await writeFile(getSummaryPath(runDirectory), `${lines.join("\n")}\n`, "utf8");
}
