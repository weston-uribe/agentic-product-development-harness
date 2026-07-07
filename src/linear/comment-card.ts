export interface HarnessCommentLink {
  label: string;
  url: string;
}

export interface HarnessCommentCardInput {
  header: string;
  statusLine: string;
  links?: HarnessCommentLink[];
  pmSection?: string[];
  engineerSection?: string[];
  warningSection?: string[];
  footer: string;
}

export function buildHarnessComment(input: HarnessCommentCardInput): string {
  const lines = [input.header, "", input.statusLine, ""];

  if (input.links && input.links.length > 0) {
    lines.push("### Links");
    for (const link of input.links) {
      lines.push(`- [${link.label}](${link.url})`);
    }
    lines.push("");
  }

  if (input.pmSection && input.pmSection.length > 0) {
    lines.push("### What you need to know");
    lines.push(...input.pmSection);
    lines.push("");
  }

  if (input.warningSection && input.warningSection.length > 0) {
    lines.push("### Warning");
    lines.push(...input.warningSection);
    lines.push("");
  }

  if (input.engineerSection && input.engineerSection.length > 0) {
    lines.push("### Engineer details");
    lines.push(...input.engineerSection);
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n\n${input.footer}`;
}

export function formatBulletList(items: string[]): string[] {
  return items.map((item) => `- ${item}`);
}
