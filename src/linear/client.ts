import { LinearClient } from "@linear/sdk";

export interface LinearIssueSnapshot {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status: string | null;
  projectName: string | null;
  teamName: string | null;
  teamId: string | null;
  url: string | null;
}

export async function fetchLinearIssue(
  issueKey: string,
  apiKey: string,
): Promise<LinearIssueSnapshot> {
  const client = new LinearClient({ apiKey });
  const issue = await client.issue(issueKey);

  if (!issue) {
    throw new Error(`Linear issue not found: ${issueKey}`);
  }

  const [state, project, team] = await Promise.all([
    issue.state,
    issue.project,
    issue.team,
  ]);

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    status: state?.name ?? null,
    projectName: project?.name ?? null,
    teamName: team?.name ?? null,
    teamId: team?.id ?? null,
    url: issue.url ?? null,
  };
}

export async function pingLinear(apiKey: string): Promise<string> {
  const client = new LinearClient({ apiKey });
  const viewer = await client.viewer;
  return viewer.name ?? viewer.email ?? viewer.id;
}
