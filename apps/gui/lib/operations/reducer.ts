import type {
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
import type {
  OperationsBootstrapPayload,
  OperationsLayout,
  OperationsOutcome,
  OperationsRule,
  OperationsStatusRecord,
  OperationsWorkflowDraft,
} from "@harness/operations/types";
import { lookupExecutor } from "@harness/operations/executor-catalog";

export type OperationsSelection =
  | { kind: "none" }
  | { kind: "status"; statusId: string }
  | { kind: "rule"; ruleId: string }
  | { kind: "outcome"; ruleId: string; outcomeId: string };

export type OperationsSaveState =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "error";

export interface OperationsPageState {
  bootstrap: OperationsBootstrapPayload;
  draft: OperationsWorkflowDraft;
  selection: OperationsSelection;
  saveState: OperationsSaveState;
  saveMessage?: string;
  past: OperationsWorkflowDraft[];
  future: OperationsWorkflowDraft[];
}

export type OperationsAction =
  | { type: "select"; selection: OperationsSelection }
  | { type: "commit-draft"; draft: OperationsWorkflowDraft; pushHistory?: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "set-save-state"; saveState: OperationsSaveState; saveMessage?: string }
  | { type: "replace-bootstrap"; bootstrap: OperationsBootstrapPayload; draft: OperationsWorkflowDraft };

function cloneDraft(draft: OperationsWorkflowDraft): OperationsWorkflowDraft {
  return structuredClone(draft);
}

export function createInitialOperationsState(
  bootstrap: OperationsBootstrapPayload,
): OperationsPageState {
  return {
    bootstrap,
    draft: cloneDraft(bootstrap.draft!),
    selection: { kind: "none" },
    saveState: "clean",
    past: [],
    future: [],
  };
}

export function operationsReducer(
  state: OperationsPageState,
  action: OperationsAction,
): OperationsPageState {
  switch (action.type) {
    case "select":
      return { ...state, selection: action.selection };
    case "commit-draft": {
      const nextDraft = cloneDraft(action.draft);
      const pushHistory = action.pushHistory ?? true;
      return {
        ...state,
        draft: nextDraft,
        saveState: "dirty",
        past: pushHistory ? [...state.past, cloneDraft(state.draft)] : state.past,
        future: pushHistory ? [] : state.future,
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) {
        return state;
      }
      return {
        ...state,
        draft: cloneDraft(previous),
        past: state.past.slice(0, -1),
        future: [cloneDraft(state.draft), ...state.future],
        saveState: "dirty",
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) {
        return state;
      }
      return {
        ...state,
        draft: cloneDraft(next),
        past: [...state.past, cloneDraft(state.draft)],
        future: state.future.slice(1),
        saveState: "dirty",
      };
    }
    case "set-save-state":
      return {
        ...state,
        saveState: action.saveState,
        saveMessage: action.saveMessage,
      };
    case "replace-bootstrap":
      return {
        ...createInitialOperationsState(action.bootstrap),
        draft: cloneDraft(action.draft),
      };
    default:
      return state;
  }
}

export function statusNodeId(statusId: string): string {
  return `status:${statusId}`;
}

export function outcomeEdgeId(ruleId: string, outcomeId: string): string {
  return `outcome:${ruleId}:${outcomeId}`;
}

export function findRuleForStatus(
  draft: OperationsWorkflowDraft,
  statusId: string,
): OperationsRule | undefined {
  return draft.rules.find((rule) => rule.sourceStatusId === statusId);
}

export function updateLayoutPosition(
  draft: OperationsWorkflowDraft,
  statusId: string,
  position: { x: number; y: number },
): OperationsWorkflowDraft {
  return {
    ...draft,
    layout: {
      ...draft.layout,
      statusPositions: {
        ...draft.layout.statusPositions,
        [statusId]: position,
      },
    },
  };
}

export function addStatusToCanvas(
  draft: OperationsWorkflowDraft,
  statusId: string,
): OperationsWorkflowDraft {
  if (draft.statusIdsOnCanvas.includes(statusId)) {
    return draft;
  }
  return {
    ...draft,
    statusIdsOnCanvas: [...draft.statusIdsOnCanvas, statusId],
    layout: {
      ...draft.layout,
      statusPositions: {
        ...draft.layout.statusPositions,
        [statusId]: draft.layout.statusPositions[statusId] ?? {
          x: draft.statusIdsOnCanvas.length * 280,
          y: 40,
        },
      },
    },
  };
}

export function removeStatusFromCanvas(
  draft: OperationsWorkflowDraft,
  statusId: string,
): OperationsWorkflowDraft {
  const { [statusId]: _removed, ...remainingPositions } =
    draft.layout.statusPositions;
  return {
    ...draft,
    statusIdsOnCanvas: draft.statusIdsOnCanvas.filter((id) => id !== statusId),
    rules: draft.rules.filter((rule) => rule.sourceStatusId !== statusId),
    layout: {
      ...draft.layout,
      statusPositions: remainingPositions,
    },
  };
}

export function connectOutcome(
  draft: OperationsWorkflowDraft,
  connection: Connection,
): OperationsWorkflowDraft {
  const sourceStatusId = connection.source?.replace(/^status:/, "");
  const targetStatusId = connection.target?.replace(/^status:/, "");
  if (!sourceStatusId || !targetStatusId) {
    return draft;
  }

  let rules = [...draft.rules];
  let rule = rules.find((entry) => entry.sourceStatusId === sourceStatusId);
  if (!rule) {
    rule = {
      id: createId(),
      sourceStatusId,
      enabled: true,
      executorId: "human-decision",
      outcomes: [],
    };
    rules = [...rules, rule];
  }

  const nextRule: OperationsRule = {
    ...rule,
    outcomes: [
      ...rule.outcomes,
      {
        id: createId(),
        label: "New outcome",
        destinationStatusId: targetStatusId,
        enabled: true,
      },
    ],
  };

  return {
    ...draft,
    rules: rules.map((entry) => (entry.id === rule!.id ? nextRule : entry)),
  };
}

export function reconnectOutcome(
  draft: OperationsWorkflowDraft,
  edgeId: string,
  newTargetStatusId: string,
): OperationsWorkflowDraft {
  const match = edgeId.match(/^outcome:(.+?):(.+)$/);
  if (!match) {
    return draft;
  }
  const [, ruleId, outcomeId] = match;
  return {
    ...draft,
    rules: draft.rules.map((rule) =>
      rule.id === ruleId
        ? {
            ...rule,
            outcomes: rule.outcomes.map((outcome) =>
              outcome.id === outcomeId
                ? { ...outcome, destinationStatusId: newTargetStatusId }
                : outcome,
            ),
          }
        : rule,
    ),
  };
}

export function deleteOutcome(
  draft: OperationsWorkflowDraft,
  ruleId: string,
  outcomeId: string,
): OperationsWorkflowDraft {
  return {
    ...draft,
    rules: draft.rules.map((rule) =>
      rule.id === ruleId
        ? {
            ...rule,
            outcomes: rule.outcomes.filter((outcome) => outcome.id !== outcomeId),
          }
        : rule,
    ),
  };
}

export function updateRule(
  draft: OperationsWorkflowDraft,
  ruleId: string,
  patch: Partial<OperationsRule>,
): OperationsWorkflowDraft {
  return {
    ...draft,
    rules: draft.rules.map((rule) =>
      rule.id === ruleId ? { ...rule, ...patch } : rule,
    ),
  };
}

export function updateOutcome(
  draft: OperationsWorkflowDraft,
  ruleId: string,
  outcomeId: string,
  patch: Partial<OperationsOutcome>,
): OperationsWorkflowDraft {
  return {
    ...draft,
    rules: draft.rules.map((rule) =>
      rule.id === ruleId
        ? {
            ...rule,
            outcomes: rule.outcomes.map((outcome) =>
              outcome.id === outcomeId ? { ...outcome, ...patch } : outcome,
            ),
          }
        : rule,
    ),
  };
}

export function domainDraftToFlow(input: {
  draft: OperationsWorkflowDraft;
  statuses: OperationsStatusRecord[];
}): { nodes: Node[]; edges: Edge[] } {
  const statusById = new Map(input.statuses.map((status) => [status.id, status]));
  const nodes: Node[] = input.draft.statusIdsOnCanvas.map((statusId) => {
    const status = statusById.get(statusId);
    const rule = findRuleForStatus(input.draft, statusId);
    const executor = rule ? lookupExecutor(rule.executorId) : undefined;
    const position = input.draft.layout.statusPositions[statusId] ?? {
      x: 0,
      y: 0,
    };
    return {
      id: statusNodeId(statusId),
      type: "operationsStatus",
      position,
      data: {
        statusId,
        name: status?.name ?? statusId,
        category: status?.category ?? "unknown",
        color: status?.color,
        automationTriggerStatus: status?.automationTriggerStatus ?? false,
        executorLabel: executor?.label,
        executorMaturity: executor?.maturity,
        modelId: rule?.modelSelection?.modelId,
      },
      ariaLabel: `Status ${status?.name ?? statusId}`,
    };
  });

  const edges: Edge[] = [];
  for (const rule of input.draft.rules) {
    for (const outcome of rule.outcomes) {
      if (!outcome.destinationStatusId) {
        continue;
      }
      edges.push({
        id: outcomeEdgeId(rule.id, outcome.id),
        type: "operationsOutcome",
        source: statusNodeId(rule.sourceStatusId),
        target: statusNodeId(outcome.destinationStatusId),
        label: outcome.label,
        data: {
          ruleId: rule.id,
          outcomeId: outcome.id,
          enabled: outcome.enabled,
        },
        ariaLabel: `Outcome ${outcome.label}`,
      });
    }
  }

  return { nodes, edges };
}

export function applyNodeChangesToDraft(
  draft: OperationsWorkflowDraft,
  changes: NodeChange[],
): OperationsWorkflowDraft {
  let next = draft;
  for (const change of changes) {
    if (change.type === "position" && change.position && change.id) {
      const statusId = change.id.replace(/^status:/, "");
      next = updateLayoutPosition(next, statusId, change.position);
    }
  }
  return next;
}

export function applyEdgeChangesToDraft(
  draft: OperationsWorkflowDraft,
  changes: EdgeChange[],
): OperationsWorkflowDraft {
  let next = draft;
  for (const change of changes) {
    if (change.type === "remove" && change.id) {
      const match = change.id.match(/^outcome:(.+?):(.+)$/);
      if (match) {
        next = deleteOutcome(next, match[1], match[2]);
      }
    }
  }
  return next;
}

export function mergeViewport(
  layout: OperationsLayout,
  viewport: { x: number; y: number; zoom: number },
): OperationsLayout {
  return {
    ...layout,
    viewport,
  };
}
