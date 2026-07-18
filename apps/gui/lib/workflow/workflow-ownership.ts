import type { CanonicalStatusKey } from "@harness/workflow/canonical-product-development-workflow";
import { PRODUCT_DEVELOPMENT_WORKFLOW_V2 } from "@harness/workflow/definition/product-development.v2";
import type { WorkflowOwner } from "@harness/workflow/definition/types";

export type WorkflowOwnershipColumnId = "human" | "harness" | "agent";

export interface WorkflowOwnershipColumn {
  id: WorkflowOwnershipColumnId;
  title: string;
  description: string;
  statuses: readonly CanonicalStatusKey[];
}

function ownerToColumn(owner: WorkflowOwner): WorkflowOwnershipColumnId {
  if (owner === "agent") return "agent";
  if (owner === "human" || owner === "terminal") return "human";
  return "harness";
}

/**
 * Derive ownership columns from the shared workflow definition.
 * Optional review statuses are excluded until later chunks enable them.
 */
function statusesForColumn(
  column: WorkflowOwnershipColumnId,
): CanonicalStatusKey[] {
  const seen = new Set<string>();
  const result: CanonicalStatusKey[] = [];
  for (const status of PRODUCT_DEVELOPMENT_WORKFLOW_V2.statuses) {
    if (status.optionalPhaseId) continue;
    if (status.deprecated) continue;
    const col = ownerToColumn(status.owner);
    if (col !== column) continue;
    if (seen.has(status.id)) continue;
    seen.add(status.id);
    result.push(status.id as CanonicalStatusKey);
  }
  return result;
}

export const WORKFLOW_OWNERSHIP_COLUMNS: readonly WorkflowOwnershipColumn[] = [
  {
    id: "human",
    title: "Human-owned",
    description: "Decisions, approvals, and manual intervention.",
    statuses: statusesForColumn("human"),
  },
  {
    id: "harness",
    title: "Harness-owned",
    description: "Triggers, handoffs, orchestration, and system transitions.",
    statuses: statusesForColumn("harness"),
  },
  {
    id: "agent",
    title: "Agent-owned",
    description: "Work performed by Cursor Cloud Agents.",
    statuses: statusesForColumn("agent"),
  },
] as const;
