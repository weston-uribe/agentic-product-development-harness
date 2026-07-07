import { readFile } from "node:fs/promises";
import type { LinearIssueSnapshot } from "../linear/client.js";

export interface FixtureMetadata {
  title: string;
  status: string | null;
  projectName: string | null;
  teamName: string | null;
}

export async function loadIssueFixture(
  fixturePath: string,
  issueKey: string,
): Promise<LinearIssueSnapshot> {
  const raw = await readFile(fixturePath, "utf8");
  const { metadata, body } = parseFixture(raw);

  return {
    id: `fixture-${issueKey}`,
    identifier: issueKey,
    title: metadata.title ?? `Fixture issue ${issueKey}`,
    description: body,
    status: metadata.status,
    projectName: metadata.projectName,
    teamName: metadata.teamName,
    url: null,
  };
}

function parseFixture(raw: string): { metadata: FixtureMetadata; body: string } {
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!frontmatterMatch) {
    return {
      metadata: {
        title: "Fixture issue",
        status: null,
        projectName: null,
        teamName: null,
      },
      body: raw,
    };
  }

  const metadata: FixtureMetadata = {
    title: "Fixture issue",
    status: null,
    projectName: null,
    teamName: null,
  };

  for (const line of frontmatterMatch[1]!.split("\n")) {
    const match = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim().replace(/^["']|["']$/g, "");
    switch (key) {
      case "title":
        metadata.title = value;
        break;
      case "status":
        metadata.status = value || null;
        break;
      case "projectname":
        metadata.projectName = value || null;
        break;
      case "teamname":
        metadata.teamName = value || null;
        break;
      default:
        break;
    }
  }

  return { metadata, body: frontmatterMatch[2]! };
}
