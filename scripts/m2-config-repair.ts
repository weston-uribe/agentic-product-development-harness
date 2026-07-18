/**
 * M2 config repair: inspect, upsert associations, validate.
 * Never prints full config JSON.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadHarnessDotenv } from "../src/config/load-dotenv.js";
import { harnessConfigSchema } from "../src/config/schema.js";
import type { HarnessConfig, LinearAssociation } from "../src/config/types.js";
import {
  linearAssociationKey,
  resolveLinearAssociationForIssue,
  resolveLinearAssociationsFromConfig,
} from "../src/config/resolve-linear-workspace.js";
import { loadGithubTokenFromEnvLocal } from "../src/setup/setup-github-auth.js";
import {
  createLinearProject,
  createLinearSetupClient,
  createLinearTeam,
  getLinearOrganizationSummary,
  getLinearProject,
  listLinearProjects,
  listLinearTeams,
} from "../src/setup/linear-setup-client.js";
import { writeConfigLocal } from "../src/setup/config-writer.js";
import { resolveLocalFilePaths } from "../src/setup/setup-state.js";
import { buildCanonicalCloudConfigPair } from "../src/setup/sync-harness-config-cloud.js";

const PORTFOLIO_URL =
  "https://github.com/weston-uribe/weston-uribe-portfolio";
const PORTFOLIO_REPO_ID = "weston-uribe-portfolio";

const FRE_TEAM_ID = "8f9c1260-364b-4d3e-9aa2-0391767d5204";
const FRE_TEAM_KEY = "FRE";
const FRE_TEAM_NAME = "fresh p-dev linear team";
const FRE_PROJECT_ID = "63125fbb-f05a-43de-8496-c8a798e39f6b";
const FRE_PROJECT_NAME = "harness";

type LegacySnapshot = {
  repos: Array<{
    id: string;
    linearTeams?: string[];
    linearProjects?: string[];
  }>;
  linearKeys: string[];
};

function structuralReport(config: HarnessConfig) {
  return {
    repoConfigIds: config.repos.map((r) => r.id),
    targetRepos: config.repos.map((r) => r.targetRepo),
    linearAssociationCounts: Object.fromEntries(
      config.repos.map((r) => [r.id, (r.linearAssociations ?? []).length]),
    ),
    legacyPerRepo: config.repos.map((r) => ({
      id: r.id,
      hasLinearTeams: Boolean(r.linearTeams?.length),
      hasLinearProjects: Boolean(r.linearProjects?.length),
    })),
    topLevelLinearKeys: config.linear ? Object.keys(config.linear) : [],
  };
}

function legacySnapshot(config: HarnessConfig): LegacySnapshot {
  return {
    repos: config.repos.map((r) => ({
      id: r.id,
      linearTeams: r.linearTeams ? [...r.linearTeams] : undefined,
      linearProjects: r.linearProjects ? [...r.linearProjects] : undefined,
    })),
    linearKeys: config.linear ? Object.keys(config.linear).sort() : [],
  };
}

function legacyUnchanged(before: LegacySnapshot, after: HarnessConfig): boolean {
  const afterSnap = legacySnapshot(after);
  if (JSON.stringify(before.linearKeys) !== JSON.stringify(afterSnap.linearKeys)) {
    return false;
  }
  for (const repo of before.repos) {
    const match = after.repos.find((r) => r.id === repo.id);
    if (!match) return false;
    if (JSON.stringify(repo.linearTeams) !== JSON.stringify(match.linearTeams)) {
      return false;
    }
    if (
      JSON.stringify(repo.linearProjects) !==
      JSON.stringify(match.linearProjects)
    ) {
      return false;
    }
  }
  return true;
}

function findPortfolioRepo(config: HarnessConfig) {
  const repo = config.repos.find((r) => r.targetRepo === PORTFOLIO_URL);
  if (!repo) {
    throw new Error(`Portfolio repo not found: ${PORTFOLIO_URL}`);
  }
  return repo;
}

function associationMatches(
  existing: LinearAssociation,
  desired: LinearAssociation,
): boolean {
  return (
    existing.teamKey === desired.teamKey &&
    existing.teamName === desired.teamName &&
    existing.projectName === desired.projectName
  );
}

function upsertAssociation(
  associations: LinearAssociation[],
  desired: LinearAssociation,
  targetRepo: string,
): LinearAssociation[] {
  const key = linearAssociationKey(desired);
  const next = [...associations];
  const idx = next.findIndex((a) => linearAssociationKey(a) === key);
  if (idx === -1) {
    next.push(desired);
    return next;
  }
  const existing = next[idx]!;
  if (!associationMatches(existing, desired)) {
    throw new Error(
      `Conflicting association for key ${key}: existing teamKey=${existing.teamKey} projectName=${existing.projectName}`,
    );
  }
  return next;
}

function countMatching(
  associations: LinearAssociation[],
  predicate: (a: LinearAssociation) => boolean,
): number {
  return associations.filter(predicate).length;
}

function assertNoDuplicateKeys(associations: LinearAssociation[]): boolean {
  const keys = new Set<string>();
  for (const a of associations) {
    const k = linearAssociationKey(a);
    if (keys.has(k)) return false;
    keys.add(k);
  }
  return true;
}

async function resolveLinearIdentities(apiKey: string) {
  const client = createLinearSetupClient(apiKey);
  const org = await getLinearOrganizationSummary(client);
  const workspaceId = org.id;

  const teams = await listLinearTeams(client);
  let ttTeams = teams.filter(
    (t) => t.key === "TT" && t.name === "Test Team",
  );
  if (ttTeams.length > 1) {
    throw new Error(
      `Expected exactly one TT/Test Team, found ${ttTeams.length}`,
    );
  }
  let ttTeam = ttTeams[0];
  if (!ttTeam && process.env.M2_PROVISION_TT === "1") {
    ttTeam = await createLinearTeam(client, {
      name: "Test Team",
      key: "TT",
      description: "M2 dogfood Test Team",
    });
  }
  if (!ttTeam) {
    throw new Error(
      `Expected exactly one TT/Test Team, found ${ttTeams.length}`,
    );
  }

  const projects = await listLinearProjects(client);
  let testProjects = projects.filter(
    (p) => p.name === "Test Project" && p.teamIds.includes(ttTeam.id),
  );
  if (testProjects.length > 1) {
    throw new Error(
      `Expected exactly one Test Project for TT, found ${testProjects.length}`,
    );
  }
  let testProject = testProjects[0];
  if (!testProject && process.env.M2_PROVISION_TT === "1") {
    testProject = await createLinearProject(client, {
      name: "Test Project",
      teamIds: [ttTeam.id],
      description: "M2 dogfood Test Project",
    });
  }
  if (!testProject) {
    throw new Error(
      `Expected exactly one Test Project for TT, found ${testProjects.length}`,
    );
  }

  const freTeam = teams.find((t) => t.id === FRE_TEAM_ID);
  if (!freTeam) {
    throw new Error(`FRE team ${FRE_TEAM_ID} not found in Linear`);
  }
  if (freTeam.key !== FRE_TEAM_KEY || freTeam.name !== FRE_TEAM_NAME) {
    throw new Error(
      `FRE team identity mismatch: key=${freTeam.key} name=${freTeam.name}`,
    );
  }

  const freProject = await getLinearProject(client, FRE_PROJECT_ID);
  if (!freProject) {
    throw new Error(`FRE project ${FRE_PROJECT_ID} not found`);
  }
  if (freProject.name !== FRE_PROJECT_NAME) {
    throw new Error(`FRE project name mismatch: ${freProject.name}`);
  }
  if (!freProject.teamIds.includes(FRE_TEAM_ID)) {
    throw new Error(`FRE project not linked to FRE team`);
  }

  return {
    workspaceId,
    associationA: {
      workspaceId,
      teamId: ttTeam.id,
      teamKey: "TT",
      teamName: "Test Team",
      projectId: testProject.id,
      projectName: "Test Project",
    } satisfies LinearAssociation,
    associationB: {
      workspaceId,
      teamId: FRE_TEAM_ID,
      teamKey: FRE_TEAM_KEY,
      teamName: FRE_TEAM_NAME,
      projectId: FRE_PROJECT_ID,
      projectName: FRE_PROJECT_NAME,
    } satisfies LinearAssociation,
  };
}

function runValidation(
  config: HarnessConfig,
  ids: Awaited<ReturnType<typeof resolveLinearIdentities>>,
  legacyBefore: LegacySnapshot,
) {
  harnessConfigSchema.parse(config);
  const portfolio = findPortfolioRepo(config);
  const associations = portfolio.linearAssociations ?? [];

  const ttCount = countMatching(
    associations,
    (a) => a.teamKey === "TT" && a.projectName === "Test Project",
  );
  const freCount = countMatching(
    associations,
    (a) => a.teamKey === FRE_TEAM_KEY && a.projectName === FRE_PROJECT_NAME,
  );

  const ttResolve = resolveLinearAssociationForIssue(config, {
    workspaceId: ids.workspaceId,
    teamId: ids.associationA.teamId,
    teamKey: "TT",
    teamName: "Test Team",
    projectId: ids.associationA.projectId,
  });

  const freResolve = resolveLinearAssociationForIssue(config, {
    workspaceId: ids.workspaceId,
    teamId: FRE_TEAM_ID,
    teamKey: FRE_TEAM_KEY,
    teamName: FRE_TEAM_NAME,
    projectId: FRE_PROJECT_ID,
  });

  const wrongProject = resolveLinearAssociationForIssue(config, {
    teamId: FRE_TEAM_ID,
    projectId: "00000000-0000-0000-0000-000000000000",
  });

  const unrelated = resolveLinearAssociationForIssue(config, {
    teamKey: "ZZ",
    projectId: ids.associationA.projectId,
  });

  const allResolved = resolveLinearAssociationsFromConfig(config);

  return {
    schemaValid: true,
    ttAssociationCount: ttCount,
    freAssociationCount: freCount,
    ttResolvesToPortfolio: ttResolve?.repoConfigId === PORTFOLIO_REPO_ID,
    freResolvesToPortfolio: freResolve?.repoConfigId === PORTFOLIO_REPO_ID,
    wrongProjectNull: wrongProject === null,
    unrelatedTeamNull: unrelated === null,
    noDuplicateKeys: assertNoDuplicateKeys(associations),
    legacyUnchanged: legacyUnchanged(legacyBefore, config),
    totalPortfolioAssociations: associations.length,
    totalResolvedAssociations: allResolved.length,
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "full";
  const cwd = path.resolve(process.env.P_DEV_HOME ?? process.cwd());
  process.env.P_DEV_HOME = cwd;
  loadHarnessDotenv(cwd);

  const configPath = path.join(cwd, ".harness", "config.local.json");
  const raw = await readFile(configPath, "utf8");
  const config = harnessConfigSchema.parse(JSON.parse(raw));

  if (mode === "inspect") {
    console.log(JSON.stringify(structuralReport(config), null, 2));
    return;
  }

  if (mode === "validate-only") {
    const apiKey = process.env.LINEAR_API_KEY?.trim();
    if (!apiKey) throw new Error("LINEAR_API_KEY missing");
    const ids = await resolveLinearIdentities(apiKey);
    const legacyBefore = legacySnapshot(config);
    const validation = runValidation(config, ids, legacyBefore);
    const pair = await buildCanonicalCloudConfigPair(cwd);
    console.log(
      JSON.stringify(
        { validation, fingerprint: pair.fingerprint.slice(0, 16) + "…" },
        null,
        2,
      ),
    );
    return;
  }

  if (mode !== "upsert") {
    throw new Error(`Unknown mode: ${mode}`);
  }

  console.log(JSON.stringify({ phase: "inspect", ...structuralReport(config) }));

  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) throw new Error("LINEAR_API_KEY missing");
  const ids = await resolveLinearIdentities(apiKey);
  console.log(
    JSON.stringify({
      phase: "linear_ids",
      workspaceId: ids.workspaceId,
      ttTeamId: ids.associationA.teamId,
      ttProjectId: ids.associationA.projectId,
      freTeamId: ids.associationB.teamId,
      freProjectId: ids.associationB.projectId,
    }),
  );

  const legacyBefore = legacySnapshot(config);
  const portfolio = findPortfolioRepo(config);
  let associations = [...(portfolio.linearAssociations ?? [])];
  associations = upsertAssociation(associations, ids.associationA, PORTFOLIO_URL);
  associations = upsertAssociation(associations, ids.associationB, PORTFOLIO_URL);

  const nextConfig = harnessConfigSchema.parse({
    ...config,
    repos: config.repos.map((repo) =>
      repo.id === portfolio.id ? { ...repo, linearAssociations: associations } : repo,
    ),
  });

  const validation = runValidation(nextConfig, ids, legacyBefore);
  const failed = Object.entries(validation).filter(
    ([k, v]) =>
      k !== "totalPortfolioAssociations" &&
      k !== "totalResolvedAssociations" &&
      v !== true &&
      typeof v === "boolean",
  );
  if (failed.length > 0 || validation.ttAssociationCount !== 1 || validation.freAssociationCount !== 1) {
    console.log(JSON.stringify({ phase: "validation_failed", validation }));
    process.exit(1);
  }

  const paths = resolveLocalFilePaths(cwd);
  await writeConfigLocal({
    paths,
    content: `${JSON.stringify(nextConfig, null, 2)}\n`,
    force: true,
  });

  const pair = await buildCanonicalCloudConfigPair(cwd);
  console.log(
    JSON.stringify({
      phase: "upsert_complete",
      validation,
      fingerprint: pair.fingerprint,
    }),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
