import { harnessConfigSchema, type HarnessConfig } from "../config/schema.js";
import { validateRepoClosure } from "../config/load-config.js";
import { DEFAULT_MODEL_ID } from "../config/defaults.js";
import type { SetupConfigBuildInput } from "./setup-state.js";

const EXAMPLE_LINEAR_STATUSES = {
  eligibleStatuses: {
    planning: ["Ready for Planning"],
    implementation: ["Ready for Build"],
    handoff: ["PR Open"],
    revision: ["Needs Revision"],
    merge: ["Ready to Merge"],
  },
  transitionalStatuses: {
    planningInProgress: "Planning",
    buildingInProgress: "Building",
    prOpen: "PR Open",
    pmReview: "PM Review",
    blocked: "Blocked",
    readyForBuild: "Ready for Build",
    needsRevision: "Needs Revision",
    revisingInProgress: "Revising",
    readyToMerge: "Ready to Merge",
    mergingInProgress: "Merging",
    mergedToDev: "Merged to Dev",
    mergedDeployed: "Merged / Deployed",
  },
} as const;

export function buildHarnessConfig(input: SetupConfigBuildInput): HarnessConfig {
  const modelId = input.modelId ?? DEFAULT_MODEL_ID;
  const allowedTargetRepos = [...new Set(input.repos.map((repo) => repo.targetRepo))];

  const config = harnessConfigSchema.parse({
    version: 1,
    agentProvider: {
      id: "cursor",
      model: { id: modelId },
    },
    defaultModel: { id: modelId },
    linear: {
      teamKey: input.linearTeamKey ?? "TEAM",
      ...EXAMPLE_LINEAR_STATUSES,
    },
    planning: { timeoutSeconds: 1800 },
    implementation: { timeoutSeconds: 3600, branchPrefix: "cursor" },
    handoff: {
      allowPmReviewWithoutPreview: true,
      previewRequiredForSuccess: false,
    },
    revision: { timeoutSeconds: 3600 },
    merge: {
      mergeMethod: "squash",
      deleteBranchAfterMerge: false,
      allowPendingChecks: false,
      allowUnknownChecks: false,
      allowNeutralChecks: true,
      deploymentRequiredForSuccess: false,
      deploymentPollTimeoutSeconds: 300,
      deploymentPollIntervalSeconds: 15,
      checkPollTimeoutSeconds: 120,
    },
    preview: {
      pollTimeoutSeconds: 300,
      pollIntervalSeconds: 15,
    },
    repos: input.repos.map((repo) => ({
      id: repo.id,
      linearProjects: repo.linearProjects,
      linearTeams: repo.linearTeams,
      targetRepo: repo.targetRepo,
      baseBranch: repo.baseBranch ?? "dev",
      productionBranch: repo.productionBranch ?? "main",
      previewProvider: repo.previewProvider ?? "vercel",
      integrationPreviewUrl: repo.integrationPreviewUrl,
      productionUrl: repo.productionUrl,
      integrationSuccessStatus: repo.integrationSuccessStatus ?? "Merged to Dev",
      productionSuccessStatus:
        repo.productionSuccessStatus ?? "Merged / Deployed",
      validation: repo.validationCommands
        ? { commands: repo.validationCommands }
        : { commands: ["npm run lint", "npm run build"] },
    })),
    allowedTargetRepos,
  });

  validateRepoClosure(config);
  return config;
}

export function formatHarnessConfigJson(config: HarnessConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function buildHarnessConfigJson(input: SetupConfigBuildInput): string {
  return formatHarnessConfigJson(buildHarnessConfig(input));
}

export function buildExampleTargetAppConfig(): HarnessConfig {
  return buildHarnessConfig({
    repos: [
      {
        id: "target-app",
        linearProjects: ["Example Target App"],
        targetRepo: "https://github.com/owner/example-target-app",
        baseBranch: "dev",
        productionBranch: "main",
        previewProvider: "vercel",
        integrationSuccessStatus: "Merged to Dev",
        productionSuccessStatus: "Merged / Deployed",
        productionUrl: "https://www.example.com",
        integrationPreviewUrl: "https://staging.example.com",
        validationCommands: ["npm run lint", "npm run build"],
      },
    ],
  });
}
