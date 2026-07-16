import { randomUUID } from "node:crypto";
import {
  CANONICAL_AGENT_PHASES,
  CANONICAL_STATUSES,
  CANONICAL_WORKFLOW_FINGERPRINT,
  getDefaultCanonicalLayout,
  lookupCanonicalStatusByExactName,
  type CanonicalAgentPhaseKey,
  type CanonicalStatusKey,
} from "../workflow/canonical-product-development-workflow.js";
import {
  operationsWorkflowDraftSchema,
  operationsWorkflowDraftV1Schema,
} from "./schema.js";
import type {
  OperationsDraftModelSelection,
  OperationsStatusRecord,
  OperationsWorkflowDraft,
  OperationsWorkflowDraftV1,
} from "./types.js";

const EXECUTOR_TO_PHASE: Record<string, CanonicalAgentPhaseKey> = {
  "planner-agent": "planning",
  "implementation-agent": "implementation",
  "revision-agent": "revision",
  "merge-runner": "merge-integration-repair",
};

function resolveCanonicalKeyForStatusId(
  statusId: string,
  statuses: OperationsStatusRecord[],
): CanonicalStatusKey | undefined {
  const status = statuses.find((entry) => entry.id === statusId);
  if (!status) {
    return undefined;
  }
  if (status.canonicalStatusKey) {
    return status.canonicalStatusKey;
  }
  return lookupCanonicalStatusByExactName(status.name)?.key;
}

export function migrateV1DraftToV2(input: {
  v1: OperationsWorkflowDraftV1;
  statuses: OperationsStatusRecord[];
}): OperationsWorkflowDraft {
  const layout = getDefaultCanonicalLayout();
  const phaseModelSettings: Partial<
    Record<CanonicalAgentPhaseKey, OperationsDraftModelSelection>
  > = {};

  for (const [linearStatusId, position] of Object.entries(
    input.v1.layout.statusPositions,
  )) {
    const canonicalKey = resolveCanonicalKeyForStatusId(linearStatusId, input.statuses);
    if (canonicalKey) {
      layout[canonicalKey] = position;
    }
  }

  for (const rule of input.v1.rules) {
    if (!rule.enabled || !rule.modelSelection) {
      continue;
    }
    const phaseKey = EXECUTOR_TO_PHASE[rule.executorId];
    if (!phaseKey || phaseModelSettings[phaseKey]) {
      continue;
    }
    phaseModelSettings[phaseKey] = rule.modelSelection;
  }

  const migrated: OperationsWorkflowDraft = {
    schemaVersion: 2,
    draftId: input.v1.draftId,
    createdAt: input.v1.createdAt,
    updatedAt: new Date().toISOString(),
    savedByRuntime: input.v1.savedByRuntime,
    sourceMode: input.v1.sourceMode,
    baseSnapshot: {
      ...input.v1.baseSnapshot,
      workflowFingerprint: CANONICAL_WORKFLOW_FINGERPRINT,
    },
    layout: {
      statusPositions: layout,
      viewport: input.v1.layout.viewport,
    },
    phaseModelSettings,
    metadata: {
      migratedFromV1: true,
      migrationNotice:
        "Prototype workflow rules were discarded. Layout and recognized phase model selections were preserved.",
    },
    warningsAtSave: input.v1.warningsAtSave,
  };

  return operationsWorkflowDraftSchema.parse(migrated);
}

export function parseOperationsDraft(raw: unknown): OperationsWorkflowDraft | null {
  const v2 = operationsWorkflowDraftSchema.safeParse(raw);
  if (v2.success) {
    return v2.data;
  }
  const v1 = operationsWorkflowDraftV1Schema.safeParse(raw);
  if (!v1.success) {
    return null;
  }
  return null;
}

export function parseAndMigrateOperationsDraft(input: {
  raw: unknown;
  statuses: OperationsStatusRecord[];
}): { draft: OperationsWorkflowDraft | null; migrated: boolean } {
  const v2 = operationsWorkflowDraftSchema.safeParse(input.raw);
  if (v2.success) {
    return { draft: v2.data, migrated: false };
  }
  const v1 = operationsWorkflowDraftV1Schema.safeParse(input.raw);
  if (!v1.success) {
    return { draft: null, migrated: false };
  }
  return {
    draft: migrateV1DraftToV2({ v1: v1.data as OperationsWorkflowDraftV1, statuses: input.statuses }),
    migrated: true,
  };
}

export function createCanonicalBaselineDraft(input: {
  baseSnapshot: OperationsWorkflowDraft["baseSnapshot"];
  sourceMode: OperationsWorkflowDraft["sourceMode"];
  savedByRuntime: OperationsWorkflowDraft["savedByRuntime"];
  phaseModelSettings?: OperationsWorkflowDraft["phaseModelSettings"];
  layout?: OperationsWorkflowDraft["layout"];
}): OperationsWorkflowDraft {
  const now = new Date().toISOString();
  return operationsWorkflowDraftSchema.parse({
    schemaVersion: 2,
    draftId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    savedByRuntime: input.savedByRuntime,
    sourceMode: input.sourceMode,
    baseSnapshot: {
      ...input.baseSnapshot,
      workflowFingerprint: CANONICAL_WORKFLOW_FINGERPRINT,
    },
    layout: input.layout ?? {
      statusPositions: getDefaultCanonicalLayout(),
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
    phaseModelSettings: input.phaseModelSettings ?? {},
  });
}

export function getCanonicalStatusKeysOnGraph(): CanonicalStatusKey[] {
  return CANONICAL_STATUSES.map((status) => status.key);
}

export function getModelConfigurablePhaseKeys(): CanonicalAgentPhaseKey[] {
  return CANONICAL_AGENT_PHASES.filter((phase) => phase.supportsModelConfiguration).map(
    (phase) => phase.key,
  );
}
