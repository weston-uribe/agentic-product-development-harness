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
import { useCallback, useEffect, useMemo } from "react";
import { StatusNode } from "./status-node";
import { OutcomeEdge } from "./outcome-edge";
import type { OperationsBootstrapPayload, OperationsWorkflowDraft } from "@harness/operations/types";
import {
  applyEdgeChangesToDraft,
  applyNodeChangesToDraft,
  connectOutcome,
  domainDraftToFlow,
  mergeViewport,
  outcomeEdgeId,
  reconnectOutcome,
  statusNodeId,
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
};

function OperationsCanvasInner({
  bootstrap,
  draft,
  onDraftChange,
  onSelect,
  fitViewSignal,
}: OperationsCanvasInnerProps) {
  const { fitView, getViewport } = useReactFlow();
  const derived = useMemo(
    () => domainDraftToFlow({ draft, statuses: bootstrap.statuses }),
    [bootstrap.statuses, draft],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(derived.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(derived.edges);

  useEffect(() => {
    setNodes(derived.nodes);
    setEdges(derived.edges);
  }, [derived.edges, derived.nodes, setEdges, setNodes]);

  useEffect(() => {
    if (fitViewSignal > 0) {
      void fitView({ padding: 0.2 }).then(() => {
        onDraftChange(
          {
            ...draft,
            layout: mergeViewport(draft.layout, getViewport()),
          },
          false,
        );
      });
    }
  }, [draft, fitView, fitViewSignal, getViewport, onDraftChange]);

  const onConnect = useCallback(
    (connection: Connection) => {
      onDraftChange(connectOutcome(draft, connection));
    },
    [draft, onDraftChange],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
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
    [draft, onDraftChange, onSelect],
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
      }
    },
    [onSelect],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      let next = draft;
      for (const edge of deletedEdges) {
        next = applyEdgeChangesToDraft(next, [{ id: edge.id, type: "remove" }]);
      }
      onDraftChange(next);
    },
    [draft, onDraftChange],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      const targetStatusId = newConnection.target?.replace(/^status:/, "");
      if (!targetStatusId) {
        return;
      }
      onDraftChange(reconnectOutcome(draft, oldEdge.id, targetStatusId));
    },
    [draft, onDraftChange],
  );

  const onMoveEnd = useCallback(() => {
    onDraftChange(
      {
        ...draft,
        layout: mergeViewport(draft.layout, getViewport()),
      },
      false,
    );
  }, [draft, getViewport, onDraftChange]);

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
      defaultViewport={draft.layout.viewport}
      fitView
      proOptions={{ hideAttribution: true }}
      className="h-full w-full bg-background"
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
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

export { statusNodeId, outcomeEdgeId };
