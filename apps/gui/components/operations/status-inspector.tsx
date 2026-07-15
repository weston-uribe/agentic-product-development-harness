import type { OperationsStatusRecord } from "@harness/operations/types";

type StatusInspectorProps = {
  status: OperationsStatusRecord;
};

export function StatusInspector({ status }: StatusInspectorProps) {
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
    </div>
  );
}
