import { createHash } from "node:crypto";
import {
  lookupRequiredStatus,
  requiredCreatableStatuses,
  getDispatchTriggerStatuses,
  type RequiredWorkflowStatus,
} from "./linear-status-contract.js";
import {
  createLinearSetupClient,
  getLinearSetupCapabilities,
  listLinearProjects,
  listLinearTeams,
  listLinearWebhooks,
  listTeamWorkflowStates,
  type LinearProjectSummary,
  type LinearTeamSummary,
  type LinearWorkflowStateSummary,
} from "./linear-setup-client.js";
import { SETUP_PERMISSIONS } from "./permission-model.js";
import { tokenizeSecretInput } from "./remote-preview-fingerprint.js";

export const LINEAR_SETUP_ACTIONS = {
  preview: {
    id: "preview-linear-setup",
    permission: SETUP_PERMISSIONS.remoteRead,
  },
  apply: {
    id: "apply-linear-setup",
    permission: SETUP_PERMISSIONS.linearWrite,
  },
} as const;

export interface LinearTeamPlanInput {
  mode: "existing" | "create";
  teamId?: string;
  teamKey?: string;
  teamName?: string;
}

export interface LinearProjectPlanInput {
  mode: "existing" | "create";
  projectId?: string;
  projectName?: string;
  description?: string;
}

export interface LinearSetupPlanInput {
  linearApiKey: string;
  team: LinearTeamPlanInput;
  project: LinearProjectPlanInput;
}

export interface WorkflowStatusPlanEntry {
  name: string;
  category: RequiredWorkflowStatus["category"];
  role: RequiredWorkflowStatus["role"];
  present: boolean;
  existingType?: string;
  action: "skip" | "create" | "manual";
  creatable: boolean;
}

export interface LinearSetupPreview {
  actionId: string;
  capabilities: ReturnType<typeof getLinearSetupCapabilities>;
  teams: LinearTeamSummary[];
  projects: LinearProjectSummary[];
  selectedTeam?: LinearTeamSummary;
  selectedProject?: LinearProjectSummary;
  workflowStates: WorkflowStatusPlanEntry[];
  dispatchTriggerStatuses: readonly string[];
  missingStatuses: string[];
  createActions: Array<{ kind: "team" | "project" | "workflow-state"; name: string }>;
  manualSteps: string[];
  fingerprint: string;
  permission: typeof SETUP_PERMISSIONS.remoteRead;
  validationError?: string;
}

function hashPreview(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
}

function matchWorkflowStates(
  existing: LinearWorkflowStateSummary[],
): WorkflowStatusPlanEntry[] {
  const byName = new Map(
    existing.map((state) => [state.name.trim().toLowerCase(), state]),
  );

  return requiredCreatableStatuses().map((required) => {
    const match = byName.get(required.name.toLowerCase());
  const present = Boolean(match);
    let action: WorkflowStatusPlanEntry["action"] = "skip";
    if (!present) {
      action = required.creatable ? "create" : "manual";
    }
    return {
      name: required.name,
      category: required.category,
      role: required.role,
      present,
      existingType: match?.type,
      action,
      creatable: required.creatable,
    };
  });
}

export async function previewLinearSetup(
  input: LinearSetupPlanInput,
): Promise<LinearSetupPreview> {
  const capabilities = getLinearSetupCapabilities();
  const manualSteps: string[] = [];
  const createActions: LinearSetupPreview["createActions"] = [];

  if (!input.linearApiKey.trim()) {
    return {
      actionId: LINEAR_SETUP_ACTIONS.preview.id,
      capabilities,
      teams: [],
      projects: [],
      workflowStates: [],
      dispatchTriggerStatuses: getDispatchTriggerStatuses(),
      missingStatuses: requiredCreatableStatuses()
        .filter((status) => status.creatable)
        .map((status) => status.name),
      createActions: [],
      manualSteps: ["Add LINEAR_API_KEY in Step 1 before previewing Linear setup."],
      fingerprint: hashPreview({ invalid: "missing-linear-key" }),
      permission: LINEAR_SETUP_ACTIONS.preview.permission,
      validationError: "LINEAR_API_KEY is required for Linear setup preview.",
    };
  }

  const client = createLinearSetupClient(input.linearApiKey);
  const teams = await listLinearTeams(client);
  const projects = await listLinearProjects(client);

  let selectedTeam: LinearTeamSummary | undefined;
  if (input.team.mode === "existing") {
    selectedTeam = teams.find((team) => team.id === input.team.teamId);
    if (!selectedTeam && input.team.teamId) {
      return {
        actionId: LINEAR_SETUP_ACTIONS.preview.id,
        capabilities,
        teams,
        projects,
        workflowStates: [],
        dispatchTriggerStatuses: getDispatchTriggerStatuses(),
        missingStatuses: [],
        createActions: [],
        manualSteps: [],
        fingerprint: hashPreview({ invalid: "team-not-found" }),
        permission: LINEAR_SETUP_ACTIONS.preview.permission,
        validationError: "Selected Linear team was not found.",
      };
    }
  } else if (input.team.teamName && input.team.teamKey) {
    createActions.push({
      kind: "team",
      name: `${input.team.teamName} (${input.team.teamKey})`,
    });
    selectedTeam = {
      id: "pending-team",
      key: input.team.teamKey,
      name: input.team.teamName,
    };
  }

  let selectedProject: LinearProjectSummary | undefined;
  if (input.project.mode === "existing") {
    selectedProject = projects.find(
      (project) => project.id === input.project.projectId,
    );
  } else if (input.project.projectName && selectedTeam) {
    createActions.push({
      kind: "project",
      name: input.project.projectName,
    });
    selectedProject = {
      id: "pending-project",
      name: input.project.projectName,
      teamIds: selectedTeam.id === "pending-team" ? [] : [selectedTeam.id],
    };
  }

  let workflowStates: WorkflowStatusPlanEntry[] = [];
  if (selectedTeam && selectedTeam.id !== "pending-team") {
    const existingStates = await listTeamWorkflowStates(client, selectedTeam.id);
    workflowStates = matchWorkflowStates(existingStates);
    for (const entry of workflowStates) {
      if (entry.action === "create") {
        createActions.push({ kind: "workflow-state", name: entry.name });
      }
      if (entry.action === "manual") {
        manualSteps.push(
          `${entry.name} is Linear-managed and must be verified manually in the workspace.`,
        );
      }
      if (
        entry.present &&
        entry.existingType &&
        lookupRequiredStatus(entry.name)?.category !== entry.existingType
      ) {
        manualSteps.push(
          `${entry.name} exists but uses category ${entry.existingType}; harness expects ${lookupRequiredStatus(entry.name)?.category}. Rename manually if needed.`,
        );
      }
    }
  } else if (selectedTeam) {
    workflowStates = requiredCreatableStatuses().map((required) => ({
      name: required.name,
      category: required.category,
      role: required.role,
      present: false,
      action: required.creatable ? "create" : "manual",
      creatable: required.creatable,
    }));
    for (const entry of workflowStates) {
      if (entry.action === "create") {
        createActions.push({ kind: "workflow-state", name: entry.name });
      }
    }
  }

  const missingStatuses = workflowStates
    .filter((entry) => !entry.present && entry.creatable)
    .map((entry) => entry.name);

  const fingerprint = hashPreview({
    actionId: LINEAR_SETUP_ACTIONS.preview.id,
    team: input.team,
    project: input.project,
    workflowStates: workflowStates.map((entry) => ({
      name: entry.name,
      action: entry.action,
    })),
    linearApiKeyToken: tokenizeSecretInput(input.linearApiKey),
  });

  return {
    actionId: LINEAR_SETUP_ACTIONS.preview.id,
    capabilities,
    teams,
    projects,
    selectedTeam,
    selectedProject,
    workflowStates,
    dispatchTriggerStatuses: getDispatchTriggerStatuses(),
    missingStatuses,
    createActions,
    manualSteps,
    fingerprint,
    permission: LINEAR_SETUP_ACTIONS.preview.permission,
  };
}

export async function summarizeLinearWebhookReadiness(input: {
  linearApiKey: string;
  webhookUrl: string;
  teamId?: string;
}): Promise<{
  webhooks: Awaited<ReturnType<typeof listLinearWebhooks>>;
  matchingWebhook?: Awaited<ReturnType<typeof listLinearWebhooks>>[number];
  manualSteps: string[];
}> {
  const client = createLinearSetupClient(input.linearApiKey);
  const webhooks = await listLinearWebhooks(client);
  const normalizedTarget = input.webhookUrl.trim().replace(/\/$/, "");
  const matchingWebhook = webhooks.find((webhook) => {
    const normalized = webhook.url.trim().replace(/\/$/, "");
    const teamMatches = input.teamId ? webhook.teamId === input.teamId : true;
    return (
      teamMatches &&
      normalized === normalizedTarget &&
      webhook.enabled &&
      webhook.resourceTypes.includes("Issue")
    );
  });

  const manualSteps: string[] = [];
  if (!matchingWebhook) {
    manualSteps.push(
      `Create a Linear Issue webhook pointing at ${input.webhookUrl}.`,
    );
    manualSteps.push(
      "Copy the webhook signing secret into Vercel production env var LINEAR_WEBHOOK_SECRET.",
    );
  }

  return { webhooks, matchingWebhook, manualSteps };
}
