import type {
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
import type {
  OperationsBootstrapPayload,
  OperationsDraftModelSelection,
  OperationsExecutorCatalogEntry,
  OperationsLayout,
  OperationsModelCatalogEntry,
  OperationsOutcome,
  OperationsRule,
  OperationsStatusRecord,
  OperationsValidationResult,
  OperationsWorkflowDraft,
} from "@harness/operations/types";
import { lookupExecutor } from "@harness/operations/executor-catalog";

export const OPERATIONS_HISTORY_LIMIT = 100;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type OperationsSelection =
  | { kind: "none" }
  | { kind: "status"; statusId: string }
  | { kind: "rule"; ruleId: string }
  | { kind: "outcome"; ruleId: string; outcomeId: string };

export type OperationsRequestState =
  | "idle"
  | "saving"
  | "resetting"
  | "saved"
  | "error";

/** @deprecated Use OperationsRequestState */
export type OperationsSaveState = OperationsRequestState;

export function isDraftDirty(
  draft: OperationsWorkflowDraft,
  cleanFingerprint: string,
): boolean {
  return fingerprintOperationsDraft(draft) !== cleanFingerprint;
}

function selectionEquals(
  left: OperationsSelection,
  right: OperationsSelection,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "none" || right.kind === "none") {
    return true;
  }
  if (left.kind === "status" && right.kind === "status") {
    return left.statusId === right.statusId;
  }
  if (left.kind === "rule" && right.kind === "rule") {
    return left.ruleId === right.ruleId;
  }
  if (left.kind === "outcome" && right.kind === "outcome") {
    return left.ruleId === right.ruleId && left.outcomeId === right.outcomeId;
  }
  return false;
}

export function normalizeViewport(viewport: {
  x: number;
  y: number;
  zoom: number;
}): { x: number; y: number; zoom: number } {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    x: round(viewport.x),
    y: round(viewport.y),
    zoom: round(viewport.zoom),
  };
}

export function viewportsEqual(
  left?: { x: number; y: number; zoom: number },
  right?: { x: number; y: number; zoom: number },
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  const normalizedLeft = normalizeViewport(left);
  const normalizedRight = normalizeViewport(right);
  return (
    normalizedLeft.x === normalizedRight.x &&
    normalizedLeft.y === normalizedRight.y &&
    normalizedLeft.zoom === normalizedRight.zoom
  );
}

export function shouldInitialFit(viewport?: { x: number; y: number; zoom: number }): boolean {
  if (!viewport) {
    return true;
  }
  return viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1;
}

export function mergeViewportIfChanged(
  layout: OperationsLayout,
  viewport: { x: number; y: number; zoom: number },
): OperationsLayout {
  if (viewportsEqual(layout.viewport, viewport)) {
    return layout;
  }
  return mergeViewport(layout, viewport);
}

export interface OperationsPageState {
  bootstrap: OperationsBootstrapPayload;
  unavailableReason?: string;
  draft: OperationsWorkflowDraft;
  cleanDraft: OperationsWorkflowDraft;
  cleanFingerprint: string;
  selection: OperationsSelection;
  requestState: OperationsRequestState;
  saveMessage?: string;
  validation?: OperationsValidationResult;
  past: OperationsWorkflowDraft[];
  future: OperationsWorkflowDraft[];
  activeRequest?: {
    token: number;
    kind: "save" | "reset";
    draftFingerprintAtStart: string;
  };
  nextRequestToken: number;
}

export type OperationsAction =
  | { type: "select"; selection: OperationsSelection }
  | { type: "commit-draft"; draft: OperationsWorkflowDraft; pushHistory?: boolean; syncClean?: boolean }
  | { type: "save-start" }
  | {
      type: "save-success";
      token: number;
      draft: OperationsWorkflowDraft;
      validation?: OperationsValidationResult;
      message?: string;
    }
  | { type: "save-error"; token: number; message: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "set-request-state"; requestState: OperationsRequestState; saveMessage?: string }
  | { type: "replace-bootstrap"; bootstrap: OperationsBootstrapPayload; draft?: OperationsWorkflowDraft }
  | { type: "reset-start" }
  | {
      type: "reset-success";
      token: number;
      bootstrap: OperationsBootstrapPayload;
      draft?: OperationsWorkflowDraft;
      message?: string;
    }
  | { type: "reset-error"; token: number; message: string };

function cloneDraft(draft: OperationsWorkflowDraft): OperationsWorkflowDraft {
  return structuredClone(draft);
}

export function fingerprintOperationsDraft(draft: OperationsWorkflowDraft): string {
  return JSON.stringify(draft);
}

export function mergeViewport(
  layout: OperationsLayout,
  viewport: { x: number; y: number; zoom: number },
): OperationsLayout {
  return {
    ...layout,
    viewport: normalizeViewport(viewport),
  };
}

function pushHistory(
  past: OperationsWorkflowDraft[],
  draft: OperationsWorkflowDraft,
): OperationsWorkflowDraft[] {
  return [...past, cloneDraft(draft)].slice(-OPERATIONS_HISTORY_LIMIT);
}

function fallbackDraft(bootstrap: OperationsBootstrapPayload): OperationsWorkflowDraft {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    draftId: "unavailable-draft",
    createdAt: now,
    updatedAt: now,
    savedByRuntime: bootstrap.sourceMode === "fixture" ? "fixture-test" : "source-gui",
    sourceMode: bootstrap.sourceMode,
    baseSnapshot: {
      configFingerprint: "unavailable",
      statusCatalogFingerprint: "unavailable",
      modelCatalogFingerprint: "unavailable",
      workflowFingerprint: "unavailable",
    },
    statusIdsOnCanvas: [],
    rules: [],
    layout: { statusPositions: {}, viewport: { x: 0, y: 0, zoom: 1 } },
  };
}

export function createInitialOperationsState(
  bootstrap: OperationsBootstrapPayload,
): OperationsPageState {
  const initialDraft = cloneDraft(bootstrap.draft ?? fallbackDraft(bootstrap));
  const cleanFingerprint = fingerprintOperationsDraft(initialDraft);
  return {
    bootstrap,
    unavailableReason: bootstrap.draft
      ? undefined
      : bootstrap.validation.errors[0]?.message ??
        bootstrap.warnings[0] ??
        "Operations draft is unavailable.",
    draft: initialDraft,
    cleanDraft: cloneDraft(initialDraft),
    cleanFingerprint,
    selection: { kind: "none" },
    requestState: "idle",
    validation: bootstrap.validation,
    past: [],
    future: [],
    nextRequestToken: 1,
  };
}

export function operationsReducer(
  state: OperationsPageState,
  action: OperationsAction,
): OperationsPageState {
  switch (action.type) {
    case "select": {
      if (selectionEquals(state.selection, action.selection)) {
        return state;
      }
      return { ...state, selection: action.selection };
    }
    case "commit-draft": {
      if (state.activeRequest) {
        return state;
      }
      const nextDraft = cloneDraft(action.draft);
      const wasClean = !isDraftDirty(state.draft, state.cleanFingerprint);
      const pushHistory = action.pushHistory ?? true;
      const syncClean = action.syncClean ?? (!pushHistory && wasClean);
      return {
        ...state,
        draft: nextDraft,
        saveMessage: undefined,
        past: pushHistory ? pushHistoryFn(state.past, state.draft) : state.past,
        future: pushHistory ? [] : state.future,
        cleanDraft: syncClean ? cloneDraft(nextDraft) : state.cleanDraft,
        cleanFingerprint: syncClean
          ? fingerprintOperationsDraft(nextDraft)
          : state.cleanFingerprint,
      };
    }
    case "save-start": {
      if (state.activeRequest) {
        return state;
      }
      const dirty = isDraftDirty(state.draft, state.cleanFingerprint);
      if (!dirty && state.requestState !== "error") {
        return state;
      }
      const token = state.nextRequestToken;
      return {
        ...state,
        requestState: "saving",
        saveMessage: undefined,
        activeRequest: {
          token,
          kind: "save",
          draftFingerprintAtStart: fingerprintOperationsDraft(state.draft),
        },
        nextRequestToken: token + 1,
      };
    }
    case "save-success": {
      if (
        state.activeRequest?.kind !== "save" ||
        state.activeRequest.token !== action.token ||
        state.activeRequest.draftFingerprintAtStart !== fingerprintOperationsDraft(state.draft)
      ) {
        return state;
      }
      const savedDraft = cloneDraft(action.draft);
      const cleanFingerprint = fingerprintOperationsDraft(savedDraft);
      return {
        ...state,
        draft: savedDraft,
        cleanDraft: cloneDraft(savedDraft),
        cleanFingerprint,
        requestState: "saved",
        saveMessage: action.message,
        validation: action.validation,
        activeRequest: undefined,
        past: [],
        future: [],
      };
    }
    case "save-error": {
      if (
        state.activeRequest?.kind !== "save" ||
        state.activeRequest.token !== action.token
      ) {
        return state;
      }
      return {
        ...state,
        requestState: "error",
        saveMessage: action.message,
        activeRequest: undefined,
      };
    }
    case "undo": {
      if (state.activeRequest) {
        return state;
      }
      const previous = state.past.at(-1);
      if (!previous) {
        return state;
      }
      return {
        ...state,
        draft: cloneDraft(previous),
        past: state.past.slice(0, -1),
        future: [cloneDraft(state.draft), ...state.future],
        saveMessage: undefined,
      };
    }
    case "redo": {
      if (state.activeRequest) {
        return state;
      }
      const next = state.future[0];
      if (!next) {
        return state;
      }
      return {
        ...state,
        draft: cloneDraft(next),
        past: pushHistoryFn(state.past, state.draft),
        future: state.future.slice(1),
        saveMessage: undefined,
      };
    }
    case "set-request-state":
      return {
        ...state,
        requestState: action.requestState,
        saveMessage: action.saveMessage,
      };
    case "replace-bootstrap":
      if (!action.draft && !action.bootstrap.draft) {
        return {
          ...createInitialOperationsState(action.bootstrap),
          nextRequestToken: state.nextRequestToken,
        };
      }
      {
        const draft = cloneDraft(action.draft ?? action.bootstrap.draft!);
        const cleanFingerprint = fingerprintOperationsDraft(draft);
        return {
          ...createInitialOperationsState(action.bootstrap),
          draft,
          cleanDraft: cloneDraft(draft),
          cleanFingerprint,
          nextRequestToken: state.nextRequestToken,
        };
      }
    case "reset-start": {
      if (state.activeRequest) {
        return state;
      }
      const token = state.nextRequestToken;
      return {
        ...state,
        requestState: "resetting",
        saveMessage: undefined,
        activeRequest: {
          token,
          kind: "reset",
          draftFingerprintAtStart: fingerprintOperationsDraft(state.draft),
        },
        nextRequestToken: token + 1,
      };
    }
    case "reset-success": {
      if (
        state.activeRequest?.kind !== "reset" ||
        state.activeRequest.token !== action.token
      ) {
        return state;
      }
      const next = createInitialOperationsState(action.bootstrap);
      const draft = action.draft ?? action.bootstrap.draft;
      if (!draft) {
        return {
          ...next,
          saveMessage: action.message,
          nextRequestToken: state.nextRequestToken,
        };
      }
      const cleanDraft = cloneDraft(draft);
      return {
        ...next,
        draft: cleanDraft,
        cleanDraft: cloneDraft(cleanDraft),
        cleanFingerprint: fingerprintOperationsDraft(cleanDraft),
        requestState: "idle",
        saveMessage: action.message,
        selection: { kind: "none" },
        nextRequestToken: state.nextRequestToken,
      };
    }
    case "reset-error": {
      if (
        state.activeRequest?.kind !== "reset" ||
        state.activeRequest.token !== action.token
      ) {
        return state;
      }
      return {
        ...state,
        requestState: "error",
        saveMessage: action.message,
        activeRequest: undefined,
      };
    }
    default:
      return state;
  }
}

const pushHistoryFn = pushHistory;

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

export function computeNextStatusPosition(
  draft: OperationsWorkflowDraft,
  anchor?: { x: number; y: number },
): { x: number; y: number } {
  if (anchor) {
    return { x: anchor.x + 40, y: anchor.y + 40 };
  }
  const positions = Object.values(draft.layout.statusPositions);
  if (positions.length === 0) {
    return { x: 120, y: 120 };
  }
  const maxX = Math.max(...positions.map((position) => position.x));
  const avgY =
    positions.reduce((sum, position) => sum + position.y, 0) / positions.length;
  return { x: maxX + 280, y: avgY };
}

export function addStatusToCanvas(
  draft: OperationsWorkflowDraft,
  statusId: string,
  anchor?: { x: number; y: number },
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
        [statusId]:
          draft.layout.statusPositions[statusId] ??
          computeNextStatusPosition(draft, anchor),
      },
    },
  };
}

export function createRuleForStatus(
  draft: OperationsWorkflowDraft,
  statusId: string,
  options?: { executorId?: string },
): OperationsWorkflowDraft {
  if (findRuleForStatus(draft, statusId)) {
    return draft;
  }
  return {
    ...draft,
    rules: [
      ...draft.rules,
      {
        id: createId(),
        sourceStatusId: statusId,
        enabled: true,
        executorId: options?.executorId ?? "human-decision",
        outcomes: [],
      },
    ],
  };
}

export function removeStatusFromCanvas(
  draft: OperationsWorkflowDraft,
  statusId: string,
): OperationsWorkflowDraft {
  return {
    ...draft,
    statusIdsOnCanvas: draft.statusIdsOnCanvas.filter((id) => id !== statusId),
    rules: draft.rules
      .filter((rule) => rule.sourceStatusId !== statusId)
      .map((rule) => ({
        ...rule,
        outcomes: rule.outcomes.map((outcome) =>
          outcome.destinationStatusId === statusId
            ? { ...outcome, destinationStatusId: undefined }
            : outcome,
        ),
      })),
  };
}

export function connectOutcome(
  draft: OperationsWorkflowDraft,
  connection: Connection,
  options?: {
    statuses?: OperationsStatusRecord[];
  },
): OperationsWorkflowDraft {
  const sourceStatusId = connection.source?.replace(/^status:/, "");
  const targetStatusId = connection.target?.replace(/^status:/, "");
  if (!sourceStatusId || !targetStatusId || sourceStatusId === targetStatusId) {
    return draft;
  }
  if (
    !draft.statusIdsOnCanvas.includes(sourceStatusId) ||
    !draft.statusIdsOnCanvas.includes(targetStatusId)
  ) {
    return draft;
  }

  let rules = [...draft.rules];
  let rule = rules.find((entry) => entry.sourceStatusId === sourceStatusId);
  if (
    rule?.outcomes.some(
      (outcome) => outcome.destinationStatusId === targetStatusId && outcome.enabled,
    )
  ) {
    return draft;
  }

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

  const targetName =
    options?.statuses?.find((status) => status.id === targetStatusId)?.name ??
    "New outcome";

  const nextRule: OperationsRule = {
    ...rule,
    outcomes: [
      ...rule.outcomes,
      {
        id: createId(),
        label: targetName,
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

export function updateRuleWithExecutorCleanup(
  draft: OperationsWorkflowDraft,
  ruleId: string,
  patch: Partial<OperationsRule>,
  executors: OperationsExecutorCatalogEntry[],
): OperationsWorkflowDraft {
  return {
    ...draft,
    rules: draft.rules.map((rule) => {
      if (rule.id !== ruleId) {
        return rule;
      }
      const next: OperationsRule = { ...rule, ...patch };
      const executor = executors.find((entry) => entry.id === next.executorId);
      if (!executor?.supportsDraftModelSelection) {
        delete next.modelSelection;
      }
      if (next.executorId !== "merge-runner") {
        delete next.nestedRecoveryPolicy;
      } else if (!next.nestedRecoveryPolicy) {
        next.nestedRecoveryPolicy = {
          deterministicRepairEnabled: true,
          cursorAgentFallbackEnabled: true,
        };
      }
      return next;
    }),
  };
}

export function buildDefaultModelSelection(
  model: OperationsModelCatalogEntry,
): OperationsDraftModelSelection {
  return {
    modelId: model.id,
    displayNameAtSelection: model.displayName,
    parameters: model.supportedParameters
      .filter((parameter) => parameter.defaultValue !== undefined)
      .map((parameter) => ({
        id: parameter.id,
        value: parameter.defaultValue!,
      })),
  };
}

export function updateRuleModelSelection(
  draft: OperationsWorkflowDraft,
  ruleId: string,
  modelId: string,
  modelCatalog: OperationsModelCatalogEntry[],
): OperationsWorkflowDraft {
  const model = modelCatalog.find((entry) => entry.id === modelId);
  return updateRule(draft, ruleId, {
    modelSelection: model ? buildDefaultModelSelection(model) : undefined,
  });
}

export function updateRuleModelParameter(
  draft: OperationsWorkflowDraft,
  ruleId: string,
  parameterId: string,
  value: string,
): OperationsWorkflowDraft {
  return {
    ...draft,
    rules: draft.rules.map((rule) => {
      if (rule.id !== ruleId || !rule.modelSelection) {
        return rule;
      }
      const parameters = rule.modelSelection.parameters.filter(
        (parameter) => parameter.id !== parameterId,
      );
      return {
        ...rule,
        modelSelection: {
          ...rule.modelSelection,
          parameters: [...parameters, { id: parameterId, value }],
        },
      };
    }),
  };
}

export function addOutcomeToRule(
  draft: OperationsWorkflowDraft,
  ruleId: string,
  label = "New outcome",
): OperationsWorkflowDraft {
  return {
    ...draft,
    rules: draft.rules.map((rule) =>
      rule.id === ruleId
        ? {
            ...rule,
            outcomes: [
              ...rule.outcomes,
              {
                id: createId(),
                label,
                enabled: true,
              },
            ],
          }
        : rule,
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
