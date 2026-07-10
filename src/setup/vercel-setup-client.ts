import {
  REQUIRED_VERCEL_BRIDGE_ENV_VARS,
  type OptionalVercelBridgeEnvVarName,
  type VercelBridgeEnvVarName,
} from "./vercel-bridge-readiness.js";

export const VERCEL_API_BASE = "https://api.vercel.com";

export type VercelEnvVarType =
  | "system"
  | "encrypted"
  | "plain"
  | "sensitive"
  | "secret";

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

export class VercelEnvVarTypeError extends Error {
  readonly key: string;
  readonly existingType?: string;
  readonly status: number;

  constructor(input: {
    key: string;
    existingType?: string;
    status: number;
    message: string;
  }) {
    super(input.message);
    this.name = "VercelEnvVarTypeError";
    this.key = input.key;
    this.existingType = input.existingType;
    this.status = input.status;
  }
}

const SECRET_ENV_VAR_KEYS = new Set<VercelBridgeEnvVarName | OptionalVercelBridgeEnvVarName>([
  "LINEAR_WEBHOOK_SECRET",
  "GITHUB_DISPATCH_TOKEN",
]);

export function getDefaultEnvVarType(
  key: VercelBridgeEnvVarName | OptionalVercelBridgeEnvVarName,
): VercelEnvVarType {
  if (SECRET_ENV_VAR_KEYS.has(key)) {
    return "sensitive";
  }
  return "plain";
}

function parseVercelEnvVarTypeError(input: {
  key: string;
  existingType?: string;
  status: number;
  body: string;
}): VercelEnvVarTypeError | null {
  if (
    !/cannot change the type of a sensitive environment variable/i.test(
      input.body,
    )
  ) {
    return null;
  }

  return new VercelEnvVarTypeError({
    key: input.key,
    existingType: input.existingType,
    status: input.status,
    message:
      `Vercel rejected updating ${input.key} because it is a sensitive environment variable whose type cannot be changed. ` +
      "The app did not delete or recreate it. Update the value manually in Vercel or approve a separate delete/recreate repair.",
  });
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

export async function createVercelTeam(
  token: string,
  input: { slug: string; name?: string },
): Promise<VercelTeamSummary> {
  const data = await vercelFetch<{
    id: string;
    slug: string;
    name?: string;
  }>(token, "/v1/teams", {
    method: "POST",
    body: JSON.stringify({
      slug: input.slug.trim(),
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    }),
  });

  return {
    id: data.id,
    slug: data.slug,
    name: data.name ?? input.name?.trim() ?? data.slug,
  };
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

export async function createVercelProject(
  token: string,
  input: { name: string; teamId?: string },
): Promise<VercelProjectSummary> {
  const data = await vercelFetch<{
    id: string;
    name: string;
    accountId?: string;
  }>(token, "/v11/projects", {
    method: "POST",
    teamId: input.teamId,
    body: JSON.stringify({
      name: input.name.trim(),
    }),
  });

  return {
    id: data.id,
    name: data.name,
    accountId: data.accountId,
  };
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
    existingEnv?: VercelEnvVarSummary;
    existingEnvId?: string;
  },
): Promise<void> {
  const existingEnvId = input.existingEnv?.id ?? input.existingEnvId;
  const existingType = input.existingEnv?.type;
  const createType = getDefaultEnvVarType(input.key);

  if (existingEnvId) {
    const updateType = (existingType ?? "encrypted") as VercelEnvVarType;
    const path = `/v9/projects/${input.projectId}/env/${existingEnvId}`;
    const url = new URL(`${VERCEL_API_BASE}${path}`);
    if (input.teamId) {
      url.searchParams.set("teamId", input.teamId);
    }

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: input.key,
        value: input.value,
        type: updateType,
        target: input.existingEnv?.target?.length
          ? input.existingEnv.target
          : ["production"],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const typedError = parseVercelEnvVarTypeError({
        key: input.key,
        existingType: updateType,
        status: response.status,
        body,
      });
      if (typedError) {
        throw typedError;
      }
      throw new Error(
        `Vercel API ${response.status} on ${path}: ${body.slice(0, 200)}`,
      );
    }
    return;
  }

  const path = `/v10/projects/${input.projectId}/env`;
  const url = new URL(`${VERCEL_API_BASE}${path}`);
  if (input.teamId) {
    url.searchParams.set("teamId", input.teamId);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key: input.key,
      value: input.value,
      type: createType,
      target: ["production"],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const typedError = parseVercelEnvVarTypeError({
      key: input.key,
      existingType: createType,
      status: response.status,
      body,
    });
    if (typedError) {
      throw typedError;
    }
    throw new Error(
      `Vercel API ${response.status} on ${path}: ${body.slice(0, 200)}`,
    );
  }
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

export function findExistingTeamBySlug(
  teams: VercelTeamSummary[],
  slug: string,
): VercelTeamSummary | undefined {
  const normalized = slug.trim().toLowerCase();
  return teams.find((team) => team.slug.toLowerCase() === normalized);
}

export function findExistingProjectByName(
  projects: VercelProjectSummary[],
  name: string,
): VercelProjectSummary | undefined {
  const normalized = name.trim().toLowerCase();
  return projects.find((project) => project.name.toLowerCase() === normalized);
}
