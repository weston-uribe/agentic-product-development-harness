import type { OperationsStatusRecord } from "@harness/operations/types";

type StatusInspectorProps = {
  status: OperationsStatusRecord;
  disabled?: boolean;
  onRemove?: () => void;
};

export function StatusInspector({ status, disabled = false, onRemove }: StatusInspectorProps) {
  return (
    <div className="space-y-2 text-sm">
      <div>
        <div className="font-medium">{status.name}</div>
        <div className="text-xs capitalize text-muted-foreground">{status.category}</div>
      </div>
      {onRemove ? (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            Removing this status from the workflow does not delete it from Linear.
          </p>
          <button
            type="button"
            className="rounded-md border border-input px-2 py-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={onRemove}
          >
            Remove from workflow
          </button>
        </div>
      ) : null}
    </div>
  );
}
