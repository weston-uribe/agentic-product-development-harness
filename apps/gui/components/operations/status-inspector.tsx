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
        <div className="text-xs text-muted-foreground">{status.category}</div>
      </div>
      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Mapping state</dt>
          <dd>{status.mappingState}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Automation trigger</dt>
          <dd>{status.automationTriggerStatus ? "Yes" : "No"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Participates in workflow</dt>
          <dd>{status.participatesInCurrentHarnessWorkflow ? "Yes" : "No"}</dd>
        </div>
      </dl>
      {onRemove ? (
        <div className="rounded-md border border-border p-2 text-xs">
          <p className="text-muted-foreground">
            Removing this status only removes it from the local draft canvas. It never deletes, renames, reorders, or changes the Linear status.
          </p>
          <button
            type="button"
            className="mt-2 rounded-md border border-input px-2 py-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={onRemove}
          >
            Remove from draft canvas
          </button>
        </div>
      ) : null}
    </div>
  );
}
