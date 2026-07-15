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
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusNode } from "./status-node";
import { OutcomeEdge } from "./outcome-edge";
import type { OperationsBootstrapPayload, OperationsWorkflowDraft } from "@harness/operations/types";
import {
  applyEdgeChangesToDraft,
  applyNodeChangesToDraft,
  connectOutcome,
  domainDraftToFlow,
  fingerprintOperationsDraft,
  mergeViewportIfChanged,
  shouldInitialFit,
  statusNodeId,
  reconnectOutcome,
  viewportsEqual,
} from "@/lib/operations/react-flow-adapter";
import type { OperationsSelection } from "@/lib/operations/reducer";

const nodeTypes = { operationsStatus: StatusNode };
const edgeTypes = { operationsOutcome: OutcomeEdge };

type OperationsCanvasInnerProps = {
  bootstrap: OperationsBootstrapPayload;
  draft: OperationsWorkflowDraft;
  onDraftChange: (draft: OperationsWorkflowDraft, pushHistory?: boolean) => void;
  onSelect: (selection: OperationsSelection) => void;
  fitViewSignal: number;
  isRequestActive: boolean;
};

function OperationsCanvasInner({
  bootstrap,
  draft,
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
  const [initialViewport] = useState(
    () => draft.layout.viewport ?? { x: 0, y: 0, zoom: 1 },
  );

  useEffect(() => {
    draftRef.current = draft;
    getViewportRef.current = getViewport;
    setViewportRef.current = setViewport;
  }, [draft, getViewport, setViewport]);

  const derived = useMemo(
    () => domainDraftToFlow({ draft, statuses: bootstrap.statuses }),
    [bootstrap.statuses, draft],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(derived.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(derived.edges);

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
    setNodes(derived.nodes);
    setEdges(derived.edges);
  }, [draft, derived.edges, derived.nodes, setEdges, setNodes]);

  useEffect(() => {
    if (isPersistingViewportRef.current) {
      return;
    }
    const draftViewport = draft.layout.viewport;
    const draftViewportKey = JSON.stringify(draftViewport ?? null);
    if (draftViewportKey === lastAppliedDraftViewportRef.current) {
      return;
    }
    if (
      !draftViewport ||
      viewportsEqual(draftViewport, getViewportRef.current())
    ) {
      lastAppliedDraftViewportRef.current = draftViewportKey;
      return;
    }
    isPersistingViewportRef.current = true;
    setViewportRef.current(draftViewport);
    lastAppliedDraftViewportRef.current = draftViewportKey;
    queueMicrotask(() => {
      isPersistingViewportRef.current = false;
    });
  }, [draft.layout.viewport]);

  useEffect(() => {
    if (initialFitApplied.current) {
      return;
    }
    initialFitApplied.current = true;
    if (!shouldInitialFit(draftRef.current.layout.viewport)) {
      return;
    }
    void fitView({ padding: 0.2 }).then(() => {
      persistViewportFromFlow();
    });
  }, [fitView, persistViewportFromFlow]);

  useEffect(() => {
    if (fitViewSignal <= 0 || fitViewSignal === lastHandledFitViewSignal.current) {
      return;
    }
    lastHandledFitViewSignal.current = fitViewSignal;
    void fitView({ padding: 0.2 }).then(() => {
      persistViewportFromFlow();
    });
  }, [fitViewSignal, fitView, persistViewportFromFlow]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (isRequestActive) {
        return;
      }
      onDraftChange(connectOutcome(draft, connection));
    },
    [draft, isRequestActive, onDraftChange],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      if (isRequestActive) {
        return;
      }
      const statusId = node.id.replace(/^status:/, "");
      onDraftChange(
        applyNodeChangesToDraft(draft, [
          {
            id: node.id,
            type: "position",
            position: node.position,
          },
        ]),
        true,
      );
      onSelect({ kind: "status", statusId });
    },
    [draft, isRequestActive, onDraftChange, onSelect],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (selectedNodes[0]) {
        onSelect({
          kind: "status",
          statusId: selectedNodes[0].id.replace(/^status:/, ""),
        });
        return;
      }
      if (selectedEdges[0]) {
        const data = selectedEdges[0].data as { ruleId?: string; outcomeId?: string };
        if (data.ruleId && data.outcomeId) {
          onSelect({
            kind: "outcome",
            ruleId: data.ruleId,
            outcomeId: data.outcomeId,
          });
        }
        return;
      }
      onSelect({ kind: "none" });
    },
    [onSelect],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (isRequestActive) {
        return;
      }
      let next = draft;
      for (const edge of deletedEdges) {
        next = applyEdgeChangesToDraft(next, [{ id: edge.id, type: "remove" }]);
      }
      onDraftChange(next);
    },
    [draft, isRequestActive, onDraftChange],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (isRequestActive) {
        return;
      }
      const targetStatusId = newConnection.target?.replace(/^status:/, "");
      if (!targetStatusId) {
        return;
      }
      onDraftChange(reconnectOutcome(draft, oldEdge.id, targetStatusId));
    },
    [draft, isRequestActive, onDraftChange],
  );

  const onMoveEnd = useCallback(() => {
    persistViewportFromFlow();
  }, [persistViewportFromFlow]);

  const locked = isRequestActive;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStop={onNodeDragStop}
      onSelectionChange={onSelectionChange}
      onEdgesDelete={onEdgesDelete}
      onReconnect={onReconnect}
      onMoveEnd={onMoveEnd}
      defaultViewport={initialViewport}
      nodesDraggable={!locked}
      nodesConnectable={!locked}
      elementsSelectable={!locked}
      proOptions={{ hideAttribution: true }}
      className="h-full w-full bg-background"
      aria-busy={locked}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

export function OperationsCanvas(props: OperationsCanvasInnerProps) {
  return (
    <ReactFlowProvider key={props.draft.draftId}>
      <OperationsCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
