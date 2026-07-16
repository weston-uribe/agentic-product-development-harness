import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  MarkerType,
  type EdgeProps,
} from "@xyflow/react";

export type OutcomeEdgeData = {
  kind?: string;
  readOnly?: boolean;
};

export function OutcomeEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    selected,
  } = props;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={MarkerType.ArrowClosed}
        style={{
          stroke: selected ? "var(--ring)" : "var(--foreground)",
          strokeWidth: selected ? 3 : 2.25,
          opacity: 0.92,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className="pointer-events-none absolute rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm"
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
