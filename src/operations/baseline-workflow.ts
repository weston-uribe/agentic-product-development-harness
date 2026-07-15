import { randomUUID } from "node:crypto";
import type { AssignableExecutorId } from "./executor-catalog.js";
import type {
  OperationsBaseSnapshot,
  OperationsCurrentWorkflowMapping,
  OperationsLayout,
  OperationsOutcome,
  OperationsRule,
  OperationsSourceContext,
  OperationsStatusRecord,
  OperationsValidationIssue,
  OperationsWorkflowDraft,
} from "./types.js";
import { OPERATIONS_DRAFT_SCHEMA_VERSION } from "./constants.js";
import { lookupExecutor } from "./executor-catalog.js";

const DISPATCH_EXECUTOR_BY_KEY: Record<string, AssignableExecutorId> = {
  planning: "planner-agent",
  implementation: "implementation-agent",
  handoff: "handoff-pm-review-prep",
  revision: "revision-agent",
  merge: "merge-runner",
};

const DISPATCH_MAPPING_KEYS = new Set(Object.keys(DISPATCH_EXECUTOR_BY_KEY));

export interface BaselineTransitionSpec {
  outcomeKey: string;
  label: string;
  destinationMappingKey: string;
}

export interface BaselineRuleSpec {
  sourceMappingKey: string;
  executorId: string;
  outcomes: BaselineTransitionSpec[];
  requiresModelSelection?: boolean;
  nestedRecovery?: boolean;
}

const BASELINE_RULE_SPECS: BaselineRuleSpec[] = [
  {
    sourceMappingKey: "planning",
    executorId: "planner-agent",
    requiresModelSelection: true,
    outcomes: [
      { outcomeKey: "complete", label: "Plan completed", destinationMappingKey: "implementation" },
      { outcomeKey: "blocked", label: "Unable to proceed", destinationMappingKey: "blocked" },
    ],
  },
  {
    sourceMappingKey: "implementation",
    executorId: "implementation-agent",
    requiresModelSelection: true,
    outcomes: [
      {
        outcomeKey: "complete",
        label: "Build completed / PR created",
        destinationMappingKey: "handoff",
      },
      { outcomeKey: "blocked", label: "Unable to proceed", destinationMappingKey: "blocked" },
    ],
  },
  {
    sourceMappingKey: "handoff",
    executorId: "handoff-pm-review-prep",
    outcomes: [
      { outcomeKey: "complete", label: "Handoff completed", destinationMappingKey: "pmReview" },
    ],
  },
  {
    sourceMappingKey: "pmReview",
    executorId: "human-decision",
    outcomes: [
      {
        outcomeKey: "changes",
        label: "Changes requested",
        destinationMappingKey: "needsRevision",
      },
      { outcomeKey: "approved", label: "Approved", destinationMappingKey: "readyToMerge" },
    ],
  },
  {
    sourceMappingKey: "revision",
    executorId: "revision-agent",
    requiresModelSelection: true,
    outcomes: [
      { outcomeKey: "complete", label: "Revision completed", destinationMappingKey: "handoff" },
      { outcomeKey: "blocked", label: "Unable to proceed", destinationMappingKey: "blocked" },
    ],
  },
  {
    sourceMappingKey: "merge",
    executorId: "merge-runner",
    nestedRecovery: true,
    outcomes: [
      { outcomeKey: "merged", label: "Merged", destinationMappingKey: "mergedToDev" },
      { outcomeKey: "blocked", label: "Unable to proceed", destinationMappingKey: "blocked" },
    ],
  },
];

function resolveMappingDestination(
  mappings: OperationsCurrentWorkflowMapping[],
  mappingKey: string,
): { statusId?: string; state: OperationsCurrentWorkflowMapping["state"] } {
  const mapping = mappings.find((entry) => entry.mappingKey === mappingKey);
  if (!mapping) {
    return { state: "missing" };
  }
  if (mapping.state !== "resolved" || mapping.resolvedStatusIds.length !== 1) {
    return { state: mapping.state };
  }
  return { statusId: mapping.resolvedStatusIds[0], state: "resolved" };
}

function resolveExecutorForStatus(status: OperationsStatusRecord): string {
  const dispatchKey = status.currentMappingKeys.find((key) =>
    DISPATCH_MAPPING_KEYS.has(key),
  );
  if (dispatchKey && DISPATCH_EXECUTOR_BY_KEY[dispatchKey]) {
    return DISPATCH_EXECUTOR_BY_KEY[dispatchKey];
  }
  if (status.currentMappingKeys.includes("pmReview")) {
    return "human-decision";
  }
  if (status.automationTriggerStatus) {
    return "human-decision";
  }
  return "human-decision";
}

function findStatusForMappingKey(
  statuses: OperationsStatusRecord[],
  mappings: OperationsCurrentWorkflowMapping[],
  mappingKey: string,
): OperationsStatusRecord | undefined {
  const mapping = mappings.find((entry) => entry.mappingKey === mappingKey);
  if (!mapping || mapping.resolvedStatusIds.length !== 1) {
    return undefined;
  }
  return statuses.find((status) => status.id === mapping.resolvedStatusIds[0]);
}

export function buildBaselineRules(input: {
  statuses: OperationsStatusRecord[];
  mappings: OperationsCurrentWorkflowMapping[];
  baselineWarnings: OperationsValidationIssue[];
}): OperationsRule[] {
  const rules: OperationsRule[] = [];

  for (const spec of BASELINE_RULE_SPECS) {
    const sourceStatus = findStatusForMappingKey(
      input.statuses,
      input.mappings,
      spec.sourceMappingKey,
    );
    if (!sourceStatus) {
      input.baselineWarnings.push({
        id: "unresolved-baseline-transition",
        severity: "warning",
        message: `Baseline rule for "${spec.sourceMappingKey}" could not be created because the configured status mapping is unresolved.`,
        path: `currentWorkflowMappings.${spec.sourceMappingKey}`,
      });
      continue;
    }

    const outcomes: OperationsOutcome[] = [];
    let unresolved = false;

    for (const transition of spec.outcomes) {
      const destination = resolveMappingDestination(
        input.mappings,
        transition.destinationMappingKey,
      );
      if (!destination.statusId || destination.state !== "resolved") {
        unresolved = true;
        input.baselineWarnings.push({
          id: "unresolved-baseline-transition",
          severity: "warning",
          message: `Baseline outcome "${transition.label}" from "${spec.sourceMappingKey}" could not resolve destination mapping "${transition.destinationMappingKey}".`,
          path: `currentWorkflowMappings.${transition.destinationMappingKey}`,
          statusId: sourceStatus.id,
        });
        continue;
      }
      outcomes.push({
        id: `outcome-live-${spec.sourceMappingKey}-${transition.outcomeKey}`,
        label: transition.label,
        destinationStatusId: destination.statusId,
        enabled: true,
      });
    }

    if (unresolved || outcomes.length === 0) {
      continue;
    }

    const executor = lookupExecutor(spec.executorId);
    const rule: OperationsRule = {
      id: `rule-live-${spec.sourceMappingKey}`,
      sourceStatusId: sourceStatus.id,
      enabled: true,
      executorId: spec.executorId,
      outcomes,
    };

    if (spec.nestedRecovery && spec.executorId === "merge-runner") {
      rule.nestedRecoveryPolicy = {
        deterministicRepairEnabled: true,
        cursorAgentFallbackEnabled: true,
      };
    }

    if (spec.requiresModelSelection && executor?.supportsDraftModelSelection) {
      // Live baseline does not assign draft model until operator selects one.
    }

    rules.push(rule);
  }

  return rules;
}

function defaultLayout(statuses: OperationsStatusRecord[]): OperationsLayout {
  const statusPositions: OperationsLayout["statusPositions"] = {};
  statuses.forEach((status, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    statusPositions[status.id] = {
      x: column * 280,
      y: row * 140,
    };
  });
  return { statusPositions, viewport: { x: 0, y: 0, zoom: 1 } };
}

export function createLiveBaselineDraft(input: {
  context: OperationsSourceContext;
  baseSnapshot: OperationsBaseSnapshot;
  statuses: OperationsStatusRecord[];
  mappings: OperationsCurrentWorkflowMapping[];
  savedByRuntime: OperationsWorkflowDraft["savedByRuntime"];
  baselineWarnings?: OperationsValidationIssue[];
}): OperationsWorkflowDraft {
  const now = new Date().toISOString();
  const baselineWarnings = input.baselineWarnings ?? [];
  const onCanvas = input.statuses
    .filter((status) => status.participatesInCurrentHarnessWorkflow)
    .map((status) => status.id);

  const canvasStatuses = input.statuses.filter((status) =>
    onCanvas.includes(status.id),
  );

  return {
    schemaVersion: OPERATIONS_DRAFT_SCHEMA_VERSION,
    draftId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    savedByRuntime: input.savedByRuntime,
    sourceMode: input.context.mode,
    baseSnapshot: input.baseSnapshot,
    statusIdsOnCanvas: onCanvas,
    rules: buildBaselineRules({
      statuses: canvasStatuses,
      mappings: input.mappings,
      baselineWarnings,
    }),
    layout: defaultLayout(canvasStatuses),
    warningsAtSave: baselineWarnings.length
      ? baselineWarnings.map((warning) => warning.message)
      : undefined,
  };
}

export { DISPATCH_EXECUTOR_BY_KEY, resolveExecutorForStatus };
