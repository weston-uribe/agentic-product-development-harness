import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

export type StatusNodeData = {
  statusId: string;
  name: string;
  category: string;
  color?: string;
  automationTriggerStatus: boolean;
  executorLabel?: string;
  modelId?: string;
};

export function StatusNode({ data, selected }: NodeProps) {
  const nodeData = data as StatusNodeData;
  return (
    <div
      className={`group min-w-[220px] rounded-lg border bg-card px-3 py-2 shadow-sm ${
        selected ? "ring-2 ring-ring" : "border-border"
      }`}
      aria-label={`Status ${nodeData.name}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-primary !bg-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[selected=true]:opacity-100"
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{nodeData.name}</div>
          <div className="text-xs capitalize text-muted-foreground">{nodeData.category}</div>
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
        <div>{nodeData.executorLabel ?? "No automation"}</div>
        {nodeData.modelId ? (
          <div className="text-muted-foreground">{nodeData.modelId}</div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-emerald-600 !bg-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[selected=true]:opacity-100"
      />
    </div>
  );
}
