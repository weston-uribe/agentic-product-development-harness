import {
  REQUIRED_VERCEL_BRIDGE_ENV_VARS,
  type OptionalVercelBridgeEnvVarName,
  type VercelBridgeEnvVarName,
} from "./vercel-bridge-readiness.js";

export const VERCEL_API_BASE = "https://api.vercel.com";

export interface VercelUserSummary {
  id: string;
  username: string;
  email?: string;
}

export interface VercelTeamSummary {
  id: string;
  name: string;
  slug: string;
}

export interface VercelProjectSummary {
  id: string;
  name: string;
  accountId?: string;
}

export interface VercelEnvVarSummary {
  id?: string;
  key: string;
  target: string[];
  type: string;
}

export interface VercelDeploymentSummary {
  id: string;
  url: string;
  state: string;
  readyState?: string;
}

async function vercelFetch<T>(
  token: string,
  path: string,
  init?: RequestInit & { teamId?: string },
): Promise<T> {
  const url = new URL(`${VERCEL_API_BASE}${path}`);
  if (init?.teamId) {
    url.searchParams.set("teamId", init.teamId);
  }
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Vercel API ${response.status} on ${path}: ${body.slice(0, 200)}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function verifyVercelToken(
  token: string,
): Promise<VercelUserSummary> {
  const data = await vercelFetch<{ user: VercelUserSummary }>(token, "/v2/user");
  return data.user;
}

export async function listVercelTeams(
  token: string,
): Promise<VercelTeamSummary[]> {
  const data = await vercelFetch<{
    teams: Array<{ id: string; name: string; slug: string }>;
  }>(token, "/v2/teams");
  return (data.teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    slug: team.slug,
  }));
}

export async function listVercelProjects(
  token: string,
  teamId?: string,
): Promise<VercelProjectSummary[]> {
  const data = await vercelFetch<{
    projects: Array<{ id: string; name: string; accountId?: string }>;
  }>(token, "/v9/projects", { teamId });
  return (data.projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    accountId: project.accountId,
  }));
}

export async function listVercelProjectEnvVars(
  token: string,
  projectId: string,
  teamId?: string,
): Promise<VercelEnvVarSummary[]> {
  const data = await vercelFetch<{
    envs: Array<{ id?: string; key: string; target?: string[]; type?: string }>;
  }>(token, `/v9/projects/${projectId}/env`, { teamId });
  return (data.envs ?? []).map((env) => ({
    id: env.id,
    key: env.key,
    target: env.target ?? [],
    type: env.type ?? "encrypted",
  }));
}

export async function listVercelProductionDeployments(
  token: string,
  projectId: string,
  teamId?: string,
): Promise<VercelDeploymentSummary[]> {
  const data = await vercelFetch<{
    deployments: Array<{
      uid: string;
      url: string;
      state: string;
      readyState?: string;
    }>;
  }>(token, `/v6/deployments?projectId=${projectId}&target=production&limit=5`, {
    teamId,
  });
  return (data.deployments ?? []).map((deployment) => ({
    id: deployment.uid,
    url: deployment.url,
    state: deployment.state,
    readyState: deployment.readyState,
  }));
}

export async function upsertVercelProjectEnvVar(
  token: string,
  input: {
    projectId: string;
    teamId?: string;
    key: VercelBridgeEnvVarName | OptionalVercelBridgeEnvVarName;
    value: string;
    existingEnvId?: string;
  },
): Promise<void> {
  if (input.existingEnvId) {
    await vercelFetch(
      token,
      `/v9/projects/${input.projectId}/env/${input.existingEnvId}`,
      {
        method: "PATCH",
        teamId: input.teamId,
        body: JSON.stringify({
          key: input.key,
          value: input.value,
          type: "encrypted",
          target: ["production"],
        }),
      },
    );
    return;
  }

  await vercelFetch(token, `/v11/projects/${input.projectId}/env`, {
    method: "POST",
    teamId: input.teamId,
    body: JSON.stringify({
      key: input.key,
      value: input.value,
      type: "encrypted",
      target: ["production"],
    }),
  });
}

export async function checkWebhookEndpointReachable(
  webhookUrl: string,
): Promise<{ reachable: boolean; statusCode?: number }> {
  try {
    const response = await fetch(webhookUrl, { method: "GET" });
    return { reachable: response.status < 500, statusCode: response.status };
  } catch {
    return { reachable: false };
  }
}

export function buildWebhookUrl(productionDomain: string): string {
  const normalized = productionDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${normalized}/api/linear-webhook`;
}

export function summarizeRequiredEnvPresence(
  envVars: VercelEnvVarSummary[],
): Record<VercelBridgeEnvVarName, "present" | "missing"> {
  const keys = new Set(envVars.map((env) => env.key));
  return Object.fromEntries(
    REQUIRED_VERCEL_BRIDGE_ENV_VARS.map((name) => [
      name,
      keys.has(name) ? "present" : "missing",
    ]),
  ) as Record<VercelBridgeEnvVarName, "present" | "missing">;
}
