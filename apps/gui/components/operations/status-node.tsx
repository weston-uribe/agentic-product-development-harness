import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { ExecutorMaturityBadge } from "./executor-maturity-badge";

export type StatusNodeData = {
  statusId: string;
  name: string;
  category: string;
  color?: string;
  automationTriggerStatus: boolean;
  executorLabel?: string;
  executorMaturity?: string;
  modelId?: string;
};

export function StatusNode({ data, selected }: NodeProps) {
  const nodeData = data as StatusNodeData;
  return (
    <div
      className={`min-w-[220px] rounded-lg border bg-card px-3 py-2 shadow-sm ${
        selected ? "ring-2 ring-ring" : "border-border"
      }`}
      aria-label={`Status ${nodeData.name}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{nodeData.name}</div>
          <div className="text-xs text-muted-foreground">{nodeData.category}</div>
        </div>
        {nodeData.color ? (
          <span
            aria-hidden
            className="mt-1 size-3 rounded-full border"
            style={{ backgroundColor: nodeData.color }}
          />
        ) : null}
      </div>
      <div className="mt-2 rounded-md bg-muted/60 px-2 py-1 text-xs">
        <div className="flex items-center gap-2">
          <span>{nodeData.executorLabel ?? "No executor assigned"}</span>
          <ExecutorMaturityBadge maturity={nodeData.executorMaturity} />
        </div>
        {nodeData.modelId ? (
          <div className="text-muted-foreground">Draft model: {nodeData.modelId}</div>
        ) : null}
        {nodeData.automationTriggerStatus ? (
          <div className="text-muted-foreground">Automation trigger</div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
