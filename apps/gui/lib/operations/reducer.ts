import type { Node, NodeChange } from "@xyflow/react";
import type {
  CanonicalAgentPhaseKey,
  CanonicalStatusKey,
} from "@harness/workflow/canonical-product-development-workflow";
import type {
  OperationsBootstrapPayload,
  OperationsDraftModelSelection,
  OperationsLayout,
  OperationsModelCatalogEntry,
  OperationsValidationResult,
  OperationsWorkflowDraft,
} from "@harness/operations/types";
import {
  buildCanonicalGraph,
  CANONICAL_ACTOR_LABELS,
} from "@harness/operations/canonical-graph";

export const OPERATIONS_HISTORY_LIMIT = 100;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type OperationsSelection =
  | { kind: "none" }
  | { kind: "status"; canonicalStatusKey: CanonicalStatusKey };

export type OperationsRequestState =
  | "idle"
  | "saving"
  | "resetting"
  | "saved"
  | "error";

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
  return left.canonicalStatusKey === right.canonicalStatusKey;
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
    schemaVersion: 2,
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
    layout: { statusPositions: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    phaseModelSettings: {},
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
    case "select":
      if (selectionEquals(state.selection, action.selection)) {
        return state;
      }
      return { ...state, selection: action.selection };
    case "commit-draft": {
      if (state.activeRequest) {
        return state;
      }
      const nextDraft = cloneDraft(action.draft);
      const wasClean = !isDraftDirty(state.draft, state.cleanFingerprint);
      const pushHistoryFlag = action.pushHistory ?? true;
      const syncClean = action.syncClean ?? (!pushHistoryFlag && wasClean);
      return {
        ...state,
        draft: nextDraft,
        saveMessage: undefined,
        past: pushHistoryFlag ? pushHistory(state.past, state.draft) : state.past,
        future: pushHistoryFlag ? [] : state.future,
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
      return {
        ...state,
        draft: savedDraft,
        cleanDraft: cloneDraft(savedDraft),
        cleanFingerprint: fingerprintOperationsDraft(savedDraft),
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
        past: pushHistory(state.past, state.draft),
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
    case "replace-bootstrap": {
      if (!action.draft && !action.bootstrap.draft) {
        return {
          ...createInitialOperationsState(action.bootstrap),
          nextRequestToken: state.nextRequestToken,
        };
      }
      const draft = cloneDraft(action.draft ?? action.bootstrap.draft!);
      return {
        ...createInitialOperationsState(action.bootstrap),
        draft,
        cleanDraft: cloneDraft(draft),
        cleanFingerprint: fingerprintOperationsDraft(draft),
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

export function statusNodeId(canonicalStatusKey: CanonicalStatusKey): string {
  return `status:${canonicalStatusKey}`;
}

export function canonicalEdgeId(
  sourceKey: CanonicalStatusKey,
  targetKey: CanonicalStatusKey,
  kind: string,
): string {
  return `edge:${sourceKey}:${targetKey}:${kind}`;
}

export function updateLayoutPosition(
  draft: OperationsWorkflowDraft,
  canonicalStatusKey: CanonicalStatusKey,
  position: { x: number; y: number },
): OperationsWorkflowDraft {
  return {
    ...draft,
    layout: {
      ...draft.layout,
      statusPositions: {
        ...draft.layout.statusPositions,
        [canonicalStatusKey]: position,
      },
    },
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

export function updatePhaseModelSelection(
  draft: OperationsWorkflowDraft,
  phaseKey: CanonicalAgentPhaseKey,
  modelId: string,
  modelCatalog: OperationsModelCatalogEntry[],
): OperationsWorkflowDraft {
  const model = modelCatalog.find((entry) => entry.id === modelId);
  return {
    ...draft,
    phaseModelSettings: {
      ...draft.phaseModelSettings,
      [phaseKey]: model ? buildDefaultModelSelection(model) : undefined,
    },
  };
}

export function updatePhaseModelParameter(
  draft: OperationsWorkflowDraft,
  phaseKey: CanonicalAgentPhaseKey,
  parameterId: string,
  value: string,
): OperationsWorkflowDraft {
  const current = draft.phaseModelSettings[phaseKey];
  if (!current) {
    return draft;
  }
  const parameters = current.parameters.filter(
    (parameter) => parameter.id !== parameterId,
  );
  return {
    ...draft,
    phaseModelSettings: {
      ...draft.phaseModelSettings,
      [phaseKey]: {
        ...current,
        parameters: [...parameters, { id: parameterId, value }],
      },
    },
  };
}

export function domainDraftToFlow(input: {
  draft: OperationsWorkflowDraft;
  bootstrap: OperationsBootstrapPayload;
}): { nodes: Node[]; edges: import("@xyflow/react").Edge[] } {
  const selectedScope = input.bootstrap.scopes.find(
    (scope) => scope.id === input.bootstrap.selectedScopeId,
  );
  const graph = buildCanonicalGraph({
    draft: input.draft,
    statuses: input.bootstrap.statuses,
    baseBranch: selectedScope?.baseBranch ?? "main",
    productionBranch: selectedScope?.productionBranch ?? "main",
    canonicalViolations: input.bootstrap.canonicalWorkflow.violations,
  });

  const nodes: Node[] = graph.nodes.map((node) => ({
    id: statusNodeId(node.canonicalStatusKey),
    type: "operationsStatus",
    position: node.position,
    data: {
      canonicalStatusKey: node.canonicalStatusKey,
      name: node.name,
      category: node.category,
      color: node.color,
      automationTrigger: node.automationTrigger,
      actorLabel: CANONICAL_ACTOR_LABELS[node.actorRole] ?? node.actorRole,
      role: node.role,
      agentPhaseKey: node.agentPhaseKey,
      healthIssue: node.healthIssue,
      modelId: node.agentPhaseKey
        ? input.draft.phaseModelSettings[node.agentPhaseKey]?.modelId
        : undefined,
    },
    ariaLabel: `Status ${node.name}`,
  }));

  const edges = graph.edges.map((edge) => ({
    id: edge.id,
    type: "operationsOutcome",
    source: statusNodeId(edge.sourceKey),
    target: statusNodeId(edge.targetKey),
    label: edge.label,
    selectable: false,
    focusable: false,
    data: {
      kind: edge.kind,
      readOnly: true,
    },
    ariaLabel: `Transition to ${edge.label}`,
  }));

  return { nodes, edges };
}

export function applyNodeChangesToDraft(
  draft: OperationsWorkflowDraft,
  changes: NodeChange[],
): OperationsWorkflowDraft {
  let next = draft;
  for (const change of changes) {
    if (change.type === "position" && change.position && change.id) {
      const canonicalStatusKey = change.id.replace(
        /^status:/,
        "",
      ) as CanonicalStatusKey;
      next = updateLayoutPosition(next, canonicalStatusKey, change.position);
    }
  }
  return next;
}

export function applyEdgeChangesToDraft(
  draft: OperationsWorkflowDraft,
  _changes: import("@xyflow/react").EdgeChange[],
): OperationsWorkflowDraft {
  return draft;
}

export function connectOutcome(
  draft: OperationsWorkflowDraft,
  _connection: import("@xyflow/react").Connection,
): OperationsWorkflowDraft {
  return draft;
}

export function reconnectOutcome(
  draft: OperationsWorkflowDraft,
  _oldEdge: import("@xyflow/react").Edge,
  _newConnection: import("@xyflow/react").Connection,
): OperationsWorkflowDraft {
  return draft;
}

export function deleteOutcome(
  draft: OperationsWorkflowDraft,
  _ruleId: string,
  _outcomeId: string,
): OperationsWorkflowDraft {
  return draft;
}
