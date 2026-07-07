import type { ParsedIssue } from "../types/parsed-issue.js";

const SECTION_HEADERS = [
  "target repo",
  "task",
  "problem",
  "acceptance criteria",
  "out of scope",
  "validation expectations",
  "context and links",
  "eval hints",
  "definition of ready",
  "user / job story",
] as const;

function parseSections(description: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = description.split("\n");
  let currentKey: string | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (currentKey) {
      sections.set(currentKey, buffer.join("\n").trim());
      buffer.length = 0;
    }
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      currentKey = match[1]!.trim().toLowerCase();
      continue;
    }
    if (currentKey !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function extractListItems(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) => line.replace(/^-\s*(\[[ xX]\]\s*)?/, "").trim())
    .filter(Boolean);
}

function extractTargetRepoFromContext(contextSection: string | undefined): string | undefined {
  if (!contextSection) return undefined;
  const match = contextSection.match(/target repo:\s*`?([^`\n]+)`?/i);
  return match?.[1]?.trim();
}

export function parseIssueDescription(description: string): ParsedIssue {
  const sections = parseSections(description);
  const parseErrors: string[] = [];

  const task =
    sections.get("task")?.trim() || sections.get("problem")?.trim() || "";
  if (!task) {
    parseErrors.push("missing required section: Task (or Problem)");
  }

  const acceptanceSection = sections.get("acceptance criteria");
  const acceptanceCriteria = acceptanceSection
    ? extractListItems(acceptanceSection)
    : [];
  if (!acceptanceSection?.trim() || acceptanceCriteria.length === 0) {
    parseErrors.push("missing required section: Acceptance criteria");
  }

  const outOfScopeSection = sections.get("out of scope");
  const outOfScope = outOfScopeSection ? extractListItems(outOfScopeSection) : [];
  if (!outOfScopeSection?.trim() || outOfScope.length === 0) {
    parseErrors.push("missing required section: Out of scope");
  }

  const targetRepoRaw =
    sections.get("target repo")?.trim() ||
    extractTargetRepoFromContext(sections.get("context and links"));

  const validationExpectations = sections.get("validation expectations")?.trim();

  return {
    targetRepoRaw: targetRepoRaw || undefined,
    task,
    acceptanceCriteria,
    outOfScope,
    validationExpectations: validationExpectations || undefined,
    parseErrors,
  };
}

export function isKnownSectionHeader(header: string): boolean {
  return SECTION_HEADERS.includes(header.toLowerCase() as (typeof SECTION_HEADERS)[number]);
}
