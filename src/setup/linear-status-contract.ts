import { DISPATCH_TRIGGER_STATUSES } from "../webhook/dispatch-statuses.js";

export type LinearWorkflowStateCategory =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled";

export interface RequiredWorkflowStatus {
  name: string;
  category: LinearWorkflowStateCategory;
  role:
    | "dispatch-trigger"
    | "transitional"
    | "human-gate"
    | "terminal"
    | "system-managed";
  creatable: boolean;
}

export const DEPRECATED_STATUS_NAMES = ["Plan Review"] as const;

export const REQUIRED_WORKFLOW_STATUSES: readonly RequiredWorkflowStatus[] = [
  { name: "Backlog", category: "backlog", role: "transitional", creatable: true },
  {
    name: "Ready for Planning",
    category: "unstarted",
    role: "dispatch-trigger",
    creatable: true,
  },
  { name: "Planning", category: "started", role: "transitional", creatable: true },
  {
    name: "Ready for Build",
    category: "unstarted",
    role: "dispatch-trigger",
    creatable: true,
  },
  { name: "Building", category: "started", role: "transitional", creatable: true },
  { name: "PR Open", category: "started", role: "dispatch-trigger", creatable: true },
  { name: "PM Review", category: "started", role: "transitional", creatable: true },
  {
    name: "Engineering Review",
    category: "started",
    role: "human-gate",
    creatable: true,
  },
  {
    name: "Needs Revision",
    category: "unstarted",
    role: "dispatch-trigger",
    creatable: true,
  },
  { name: "Revising", category: "started", role: "transitional", creatable: true },
  {
    name: "Ready to Merge",
    category: "started",
    role: "dispatch-trigger",
    creatable: true,
  },
  { name: "Merging", category: "started", role: "transitional", creatable: true },
  {
    name: "Merged to Dev",
    category: "completed",
    role: "transitional",
    creatable: true,
  },
  {
    name: "Merged / Deployed",
    category: "completed",
    role: "transitional",
    creatable: true,
  },
  { name: "Blocked", category: "started", role: "terminal", creatable: true },
  { name: "Canceled", category: "canceled", role: "terminal", creatable: true },
  {
    name: "Duplicate",
    category: "canceled",
    role: "system-managed",
    creatable: false,
  },
] as const;

export function getDispatchTriggerStatuses(): readonly string[] {
  return DISPATCH_TRIGGER_STATUSES;
}

export function isDispatchTriggerStatusName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return DISPATCH_TRIGGER_STATUSES.some(
    (status) => status.toLowerCase() === normalized,
  );
}

export function requiredStatusNames(): string[] {
  return REQUIRED_WORKFLOW_STATUSES.map((status) => status.name);
}

export function requiredCreatableStatuses(): RequiredWorkflowStatus[] {
  return REQUIRED_WORKFLOW_STATUSES.filter((status) => status.creatable);
}

export function lookupRequiredStatus(
  name: string,
): RequiredWorkflowStatus | undefined {
  const normalized = name.trim().toLowerCase();
  return REQUIRED_WORKFLOW_STATUSES.find(
    (status) => status.name.toLowerCase() === normalized,
  );
}
