import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { CanonicalStatusKey } from "@harness/workflow/canonical-product-development-workflow";

export type StatusNodeData = {
  canonicalStatusKey: CanonicalStatusKey;
  name: string;
  category: string;
  color?: string;
  automationTrigger: boolean;
  actorLabel?: string;
  role: string;
  agentPhaseKey?: string;
  healthIssue?: string;
  modelId?: string;
};

export function StatusNode({ data, selected }: NodeProps) {
  const nodeData = data as StatusNodeData;
  return (
    <div
      className={`group min-w-[220px] rounded-lg border bg-card px-3 py-2 shadow-sm ${
        selected ? "ring-2 ring-ring" : "border-border"
      } ${nodeData.healthIssue ? "border-destructive/60" : ""}`}
      aria-label={`Status ${nodeData.name}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!size-2 !border-2 !border-primary !bg-background"
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
        <div>{nodeData.actorLabel ?? "No automation"}</div>
        {nodeData.modelId ? (
          <div className="text-muted-foreground">Draft: {nodeData.modelId}</div>
        ) : null}
        {nodeData.healthIssue ? (
          <div className="mt-1 text-destructive">{nodeData.healthIssue}</div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!size-2 !border-2 !border-emerald-600 !bg-background"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        isConnectable={false}
        className="!size-2 !border-2 !border-emerald-600 !bg-background opacity-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        isConnectable={false}
        className="!size-2 !border-2 !border-emerald-600 !bg-background opacity-0"
      />
    </div>
  );
}
