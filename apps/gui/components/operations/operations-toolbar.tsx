import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OperationsSaveState } from "@/lib/operations/reducer";

type OperationsToolbarProps = {
  dataSourceLabel: string;
  saveState: OperationsSaveState;
  saveMessage?: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onReset: () => void;
  onFitView: () => void;
};

export function OperationsToolbar({
  dataSourceLabel,
  saveState,
  saveMessage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onReset,
  onFitView,
}: OperationsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <h1 className="text-lg font-semibold">Operations</h1>
      <Badge variant="outline">{dataSourceLabel}</Badge>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onUndo} disabled={!canUndo}>
          Undo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onRedo} disabled={!canRedo}>
          Redo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onFitView}>
          Fit view
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          Reset draft
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={saveState === "saving"}
        >
          {saveState === "saving" ? "Saving…" : "Save draft"}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled>
          Apply to harness — coming later
        </Button>
      </div>
      {saveMessage ? (
        <p className="w-full text-xs text-muted-foreground">{saveMessage}</p>
      ) : null}
    </div>
  );
}
