export interface HarnessCommentLink {
  label: string;
  url: string;
}

export interface HarnessCommentCardInput {
  phaseLabel: string;
  pmSection?: string[];
  engineerSection?: string[];
  footer: string;
}

export function formatLinksAsMarkdown(links: HarnessCommentLink[]): string[] {
  return links.map((link) => `- [${link.label}](${link.url})`);
}

export function buildHarnessComment(input: HarnessCommentCardInput): string {
  const lines = [
    "# Comment from harness",
    "",
    `**Phase:** ${input.phaseLabel}`,
    "",
    "## For the PM",
  ];

  if (input.pmSection && input.pmSection.length > 0) {
    lines.push(...input.pmSection);
  }

  lines.push("", "---", "", "## For the engineer");

  if (input.engineerSection && input.engineerSection.length > 0) {
    lines.push(...input.engineerSection);
  }

  lines.push("", input.footer);
  return lines.join("\n");
}

export function formatBulletList(items: string[]): string[] {
  return items.map((item) => `- ${item}`);
}
