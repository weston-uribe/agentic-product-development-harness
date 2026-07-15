import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OperationsSaveState } from "@/lib/operations/reducer";

type OperationsToolbarProps = {
  dataSourceLabel: string;
  saveState: OperationsSaveState;
  saveMessage?: string;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  isRequestActive: boolean;
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
  canSave,
  isRequestActive,
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
        <Badge variant={saveState === "dirty" || saveState === "error" ? "secondary" : "outline"}>
          {saveState === "dirty"
            ? "Unsaved changes"
            : saveState === "saving"
              ? "Saving"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save error"
                  : "Clean"}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo || isRequestActive}
        >
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo || isRequestActive}
        >
          Redo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onFitView} disabled={isRequestActive}>
          Fit view
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={isRequestActive}>
          Reset draft
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={!canSave || isRequestActive}
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
