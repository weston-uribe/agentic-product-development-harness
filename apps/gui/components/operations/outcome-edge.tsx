import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export type OutcomeEdgeData = {
  ruleId: string;
  outcomeId: string;
  enabled: boolean;
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
    data,
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
  const edgeData = (data ?? {}) as OutcomeEdgeData;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "var(--ring)" : "var(--border)",
          strokeWidth: selected ? 2 : 1.5,
          opacity: edgeData.enabled === false ? 0.45 : 1,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className="pointer-events-none absolute rounded bg-background px-1.5 py-0.5 text-[10px] text-foreground shadow-sm"
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
