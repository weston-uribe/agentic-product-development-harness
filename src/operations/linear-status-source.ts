import {
  createLinearSetupClient,
  listTeamWorkflowStates,
} from "../setup/linear-setup-client.js";
import type { LinearStatusInput } from "./current-workflow.js";
import { hashOperationsFingerprint } from "./fingerprint.js";

export interface LinearStatusLoadResult {
  statuses: LinearStatusInput[];
  warning?: string;
  error?: string;
}

export async function loadLiveLinearStatuses(input: {
  apiKey: string;
  teamId: string;
}): Promise<LinearStatusLoadResult> {
  try {
    const client = createLinearSetupClient(input.apiKey);
    const states = await listTeamWorkflowStates(client, input.teamId);
    return {
      statuses: states.map((state) => ({
        id: state.id,
        name: state.name,
        type: state.type,
      })),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Linear status load failed.";
    return {
      statuses: [],
      error: message,
    };
  }
}

export function buildStatusCatalogFingerprint(
  statuses: LinearStatusInput[],
): string {
  return hashOperationsFingerprint(
    statuses
      .map((status) => ({
        id: status.id,
        name: status.name,
        type: status.type,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
}

export function sanitizeLinearColor(color: unknown): string | undefined {
  if (typeof color !== "string") {
    return undefined;
  }
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}
