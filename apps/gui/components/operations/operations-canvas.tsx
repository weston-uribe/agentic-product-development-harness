"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusNode } from "./status-node";
import { OutcomeEdge } from "./outcome-edge";
import type { OperationsBootstrapPayload, OperationsWorkflowDraft } from "@harness/operations/types";
import {
  applyNodeChangesToDraft,
  domainDraftToFlow,
  fingerprintOperationsDraft,
  mergeViewportIfChanged,
  shouldInitialFit,
  statusNodeId,
  viewportsEqual,
} from "@/lib/operations/reducer";
import type { OperationsSelection } from "@/lib/operations/reducer";

const nodeTypes = { operationsStatus: StatusNode };
const edgeTypes = { operationsOutcome: OutcomeEdge };

type OperationsCanvasInnerProps = {
  bootstrap: OperationsBootstrapPayload;
  draft: OperationsWorkflowDraft;
  selection: OperationsSelection;
  onDraftChange: (draft: OperationsWorkflowDraft, pushHistory?: boolean) => void;
  onSelect: (selection: OperationsSelection) => void;
  fitViewSignal: number;
  isRequestActive: boolean;
};

function OperationsCanvasInner({
  bootstrap,
  draft,
  selection,
  onDraftChange,
  onSelect,
  fitViewSignal,
  isRequestActive,
}: OperationsCanvasInnerProps) {
  const { fitView, getViewport, setViewport } = useReactFlow();
  const draftRef = useRef(draft);
  const getViewportRef = useRef(getViewport);
  const setViewportRef = useRef(setViewport);
  const lastHandledFitViewSignal = useRef(0);
  const initialFitApplied = useRef(false);
  const lastSyncedDraftFingerprint = useRef("");
  const isPersistingViewportRef = useRef(false);
  const lastAppliedDraftViewportRef = useRef<string | null>(null);
  const suppressSelectionClearRef = useRef(false);
  const [initialViewport] = useState(
    () => draft.layout.viewport ?? { x: 0, y: 0, zoom: 1 },
  );

  useEffect(() => {
    draftRef.current = draft;
    getViewportRef.current = getViewport;
    setViewportRef.current = setViewport;
  }, [draft, getViewport, setViewport]);

  const derived = useMemo(
    () => domainDraftToFlow({ draft, bootstrap }),
    [bootstrap, draft],
  );
  const flowNodes = useMemo(() => {
    if (selection.kind !== "status") {
      return derived.nodes;
    }
    const selectedNodeId = statusNodeId(selection.canonicalStatusKey);
    return derived.nodes.map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
    }));
  }, [derived.nodes, selection]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derived.edges);

  const persistViewportFromFlow = useCallback(() => {
    if (isRequestActive || isPersistingViewportRef.current) {
      return;
    }
    const currentDraft = draftRef.current;
    const nextLayout = mergeViewportIfChanged(
      currentDraft.layout,
      getViewportRef.current(),
    );
    if (nextLayout === currentDraft.layout) {
      return;
    }
    isPersistingViewportRef.current = true;
    lastAppliedDraftViewportRef.current = JSON.stringify(nextLayout.viewport ?? null);
    onDraftChange({ ...currentDraft, layout: nextLayout }, false);
    queueMicrotask(() => {
      isPersistingViewportRef.current = false;
    });
  }, [isRequestActive, onDraftChange]);

  useEffect(() => {
    const fingerprint = fingerprintOperationsDraft(draft);
    if (fingerprint === lastSyncedDraftFingerprint.current) {
      return;
    }
    lastSyncedDraftFingerprint.current = fingerprint;
    suppressSelectionClearRef.current = true;
    setNodes(flowNodes);
    setEdges(derived.edges);
  }, [draft, derived.edges, flowNodes, setEdges, setNodes]);

  useEffect(() => {
    if (shouldInitialFit(draft.layout.viewport) && !initialFitApplied.current) {
      initialFitApplied.current = true;
      queueMicrotask(() => fitView({ padding: 0.2, duration: 200 }));
    }
  }, [draft.layout.viewport, fitView]);

  useEffect(() => {
    if (fitViewSignal === 0 || fitViewSignal === lastHandledFitViewSignal.current) {
      return;
    }
    lastHandledFitViewSignal.current = fitViewSignal;
    fitView({ padding: 0.2, duration: 250 });
  }, [fitViewSignal, fitView]);

  useEffect(() => {
    const viewportJson = JSON.stringify(draft.layout.viewport ?? null);
    if (
      isPersistingViewportRef.current ||
      viewportJson === lastAppliedDraftViewportRef.current
    ) {
      return;
    }
    if (draft.layout.viewport && !viewportsEqual(getViewportRef.current(), draft.layout.viewport)) {
      setViewportRef.current(draft.layout.viewport, { duration: 0 });
      lastAppliedDraftViewportRef.current = viewportJson;
    }
  }, [draft.layout.viewport]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      const nextDraft = applyNodeChangesToDraft(draftRef.current, changes);
      if (nextDraft !== draftRef.current) {
        onDraftChange(nextDraft);
      }
    },
    [onDraftChange, onNodesChange],
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const canonicalStatusKey = String(node.data.canonicalStatusKey ?? "");
      if (!canonicalStatusKey) {
        return;
      }
      onSelect({
        kind: "status",
        canonicalStatusKey: canonicalStatusKey as OperationsSelection & {
          kind: "status";
        } extends { canonicalStatusKey: infer K }
          ? K
          : never,
      });
    },
    [onSelect],
  );

  const handlePaneClick = useCallback(() => {
    if (suppressSelectionClearRef.current) {
      suppressSelectionClearRef.current = false;
      return;
    }
    onSelect({ kind: "none" });
  }, [onSelect]);

  return (
    <div className="h-full min-h-[420px] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onMoveEnd={persistViewportFromFlow}
        nodesConnectable={false}
        nodesDraggable={!isRequestActive}
        edgesReconnectable={false}
        elementsSelectable
        fitView={false}
        defaultViewport={initialViewport}
        proOptions={{ hideAttribution: true }}
        aria-label="Canonical product development workflow"
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

type OperationsCanvasProps = OperationsCanvasInnerProps;

export function OperationsCanvas(props: OperationsCanvasProps) {
  return (
    <ReactFlowProvider>
      <OperationsCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
