import type { CanonicalStatusKey } from "@harness/workflow/canonical-product-development-workflow";

export type WorkflowOwnershipColumnId = "human" | "harness" | "agent";

export interface WorkflowOwnershipColumn {
  id: WorkflowOwnershipColumnId;
  title: string;
  description: string;
  statuses: readonly CanonicalStatusKey[];
}

export const WORKFLOW_OWNERSHIP_COLUMNS: readonly WorkflowOwnershipColumn[] = [
  {
    id: "human",
    title: "Human-owned",
    description: "Decisions, approvals, and manual intervention.",
    statuses: [
      "backlog",
      "pm-review",
      "engineering-review",
      "blocked",
      "canceled",
      "duplicate",
    ],
  },
  {
    id: "harness",
    title: "Harness-owned",
    description: "Triggers, handoffs, orchestration, and system transitions.",
    statuses: [
      "ready-for-planning",
      "ready-for-build",
      "pr-open",
      "needs-revision",
      "ready-to-merge",
      "merging",
      "merged-to-dev",
      "merged-deployed",
    ],
  },
  {
    id: "agent",
    title: "Agent-owned",
    description: "Work performed by Cursor Cloud Agents.",
    statuses: ["planning", "building", "revising"],
  },
] as const;
