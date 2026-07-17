import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SetupGuiViewModel } from "../../src/setup/gui-view-model.js";
import type { RemoteSetupSummary } from "../../src/setup/remote-setup-summary.js";
import { HARNESS_ACTIONS_SECRET_NAMES } from "../../src/setup/remote-actions.js";
import {
  assessCompletionEvidence,
  completeInitialSetupFromServer,
  isCompletionEvidenceSatisfied,
  isInitialSetupComplete,
  migrateExistingCompletedWorkspace,
  readInitialSetupRoutingState,
} from "../../src/setup/initial-setup-lifecycle.js";
import { readControlPlaneSetupState } from "../../src/setup/control-plane-setup-state.js";
import {
  CONFIGURE_ROUTE,
  WORKFLOW_ROUTE,
  resolvePackagedDefaultRoute,
} from "../../src/setup/packaged-default-route.js";

function completeSummary(): SetupGuiViewModel {
  return {
    overview: {
      readyForLocalDoctor: true,
      configResolved: true,
      operatorConfigResolved: true,
      localFilesPresent: true,
    },
    localFiles: [],
    configSource: {
      kind: "HARNESS_CONFIG_PATH",
      label: ".harness/config.local.json",
      resolved: true,
    },
    envKeyPresence: {
      LINEAR_API_KEY: true,
      CURSOR_API_KEY: true,
      GITHUB_TOKEN: true,
      VERCEL_TOKEN: true,
      HARNESS_CONFIG_PATH: true,
    },
    scaffoldPreviews: [],
    instructionPreviews: [],
    generatedPreviews: {},
    missingSteps: [],
    doctor: { checks: [], groups: [], failed: false, remoteChecksNote: "" },
    deferredActions: [],
  };
}

function completeRemoteSummary(): RemoteSetupSummary {
  return {
    githubTokenConfigured: true,
    harnessDispatchRepo: "owner/harness-repo",
    harnessDispatchRepoResolved: true,
    harnessDispatchRepoSource: "explicit-config",
    harnessRepoAccess: "available",
    harnessSecretStatuses: HARNESS_ACTIONS_SECRET_NAMES.map((name) => ({
      name,
      status: "present" as const,
    })),
    targetRepos: [
      {
        repoConfigId: "target-app",
        targetRepo: "https://github.com/owner/example-target-app",
        productionBranch: "main",
        repoAccess: "available",
        workflowStatus: "present",
        harnessDispatchRepo: "owner/harness-repo",
      },
    ],
    staleSmokeDiagnostics: [],
  };
}

describe("initial-setup-lifecycle", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "initial-setup-lifecycle-"));
    await mkdir(path.join(tempRoot, ".harness"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("requires all five evidence fields before completion", () => {
    const evidence = assessCompletionEvidence({
      setupSummary: completeSummary(),
      remoteSummary: completeRemoteSummary(),
      controlPlane: {
        version: 1,
        linear: {
          teamMode: "existing",
          teamId: "team-1",
          teamKey: "TEAM",
          teamName: "Team",
          projectMode: "existing",
          projectId: "project-1",
          projectName: "Project",
          statusCoverageComplete: true,
        },
        vercel: {
          projectId: "project-1",
          projectName: "vercel-project",
        },
      },
    });

    expect(isCompletionEvidenceSatisfied(evidence)).toBe(true);
  });

  it("writes durable marker via server completion helper", async () => {
    await writeFile(
      path.join(tempRoot, ".harness", "control-plane-setup.json"),
      JSON.stringify(
        {
          version: 1,
          linear: {
            teamMode: "existing",
            teamId: "team-1",
            teamKey: "TEAM",
            teamName: "Team",
            projectMode: "existing",
            projectId: "project-1",
            projectName: "Project",
            statusCoverageComplete: true,
          },
          vercel: { projectId: "project-1", projectName: "vercel-project" },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await completeInitialSetupFromServer({
      cwd: tempRoot,
      setupSummary: completeSummary(),
      remoteSummary: completeRemoteSummary(),
    });

    expect(result.ok).toBe(true);
    const state = await readControlPlaneSetupState(tempRoot);
    expect(isInitialSetupComplete(state)).toBe(true);
    expect(state?.initialSetup?.completionEvidence.localConfigPresent).toBe(true);
  });

  it("migrates completed workspaces once when marker is absent", async () => {
    await writeFile(
      path.join(tempRoot, ".harness", "control-plane-setup.json"),
      JSON.stringify(
        {
          version: 1,
          linear: {
            teamMode: "existing",
            teamId: "team-1",
            teamKey: "TEAM",
            teamName: "Team",
            projectMode: "existing",
            projectId: "project-1",
            projectName: "Project",
            statusCoverageComplete: true,
          },
          vercel: { projectId: "project-1", projectName: "vercel-project" },
        },
        null,
        2,
      ),
      "utf8",
    );

    const migrated = await migrateExistingCompletedWorkspace({
      cwd: tempRoot,
      setupSummary: completeSummary(),
      remoteSummary: completeRemoteSummary(),
    });

    expect(isInitialSetupComplete(migrated)).toBe(true);
  });

  it("routes packaged default from durable marker only", async () => {
    const incomplete = await resolvePackagedDefaultRoute(tempRoot);
    expect(incomplete.route).toBe(CONFIGURE_ROUTE);
    expect(incomplete.evidence).toBe("initial-setup-incomplete");

    await writeFile(
      path.join(tempRoot, ".harness", "control-plane-setup.json"),
      JSON.stringify(
        {
          version: 1,
          initialSetup: {
            status: "complete",
            completedAt: new Date().toISOString(),
            completionEvidence: {
              localConfigPresent: true,
              linearConfigured: true,
              vercelConfigured: true,
              cloudSecretsVerified: true,
              targetWorkflowsVerified: true,
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const complete = await resolvePackagedDefaultRoute(tempRoot);
    expect(complete.route).toBe(WORKFLOW_ROUTE);
    expect(complete.evidence).toBe("initial-setup-complete");

    const routing = await readInitialSetupRoutingState(tempRoot);
    expect(routing.complete).toBe(true);
  });
});
