import { Button } from "@/components/ui/button";
import type { OperationsStatusRecord } from "@harness/operations/types";

type AvailableStatusPanelProps = {
  statuses: OperationsStatusRecord[];
  onCanvasIds: string[];
  onAddStatus: (statusId: string) => void;
  onRemoveStatus: (statusId: string) => void;
};

export function AvailableStatusPanel({
  statuses,
  onCanvasIds,
  onAddStatus,
  onRemoveStatus,
}: AvailableStatusPanelProps) {
  const onCanvas = new Set(onCanvasIds);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-medium">Status palette</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Canvas positions are visual only and do not change Linear ordering or harness behavior.
      </p>
      <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
        {statuses.map((status) => {
          const isOnCanvas = onCanvas.has(status.id);
          return (
            <li
              key={status.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
            >
              <div>
                <div>{status.name}</div>
                <div className="text-xs text-muted-foreground">
                  {status.category} · {status.mappingState}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isOnCanvas ? "outline" : "default"}
                onClick={() =>
                  isOnCanvas ? onRemoveStatus(status.id) : onAddStatus(status.id)
                }
              >
                {isOnCanvas ? "Remove" : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
