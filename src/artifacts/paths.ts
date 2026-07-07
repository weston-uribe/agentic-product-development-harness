import path from "node:path";

export function getRunDirectory(
  logDirectory: string,
  issueKey: string,
  runId: string,
): string {
  return path.join(logDirectory, issueKey, runId);
}

export function getManifestPath(runDirectory: string): string {
  return path.join(runDirectory, "manifest.json");
}

export function getEventsPath(runDirectory: string): string {
  return path.join(runDirectory, "events.jsonl");
}

export function getSummaryPath(runDirectory: string): string {
  return path.join(runDirectory, "run-summary.md");
}

export function getIssueSnapshotPath(runDirectory: string): string {
  return path.join(runDirectory, "linear", "issue-snapshot-before.json");
}

export function getIssueSnapshotAfterPath(runDirectory: string): string {
  return path.join(runDirectory, "linear", "issue-snapshot-after.json");
}

export function getPlanningPromptPath(runDirectory: string): string {
  return path.join(runDirectory, "prompts", "planning-agent.md");
}

export function getPlanningResultPath(runDirectory: string): string {
  return path.join(runDirectory, "outputs", "planning-result.md");
}

export function getCursorRunResultPath(runDirectory: string): string {
  return path.join(runDirectory, "cursor", "run-result.json");
}

export function getCommentsWrittenPath(runDirectory: string): string {
  return path.join(runDirectory, "linear", "comments-written.md");
}

export function getErrorPath(runDirectory: string): string {
  return path.join(runDirectory, "errors", "error.json");
}
