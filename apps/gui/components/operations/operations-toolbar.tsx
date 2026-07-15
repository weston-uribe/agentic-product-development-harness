import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OperationsRequestState } from "@/lib/operations/reducer";

type OperationsToolbarProps = {
  dataSourceLabel: string;
  requestState: OperationsRequestState;
  isDirty: boolean;
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
  requestState,
  isDirty,
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
  const statusLabel =
    requestState === "saving"
      ? "Saving"
      : requestState === "resetting"
        ? "Resetting"
        : requestState === "saved"
          ? "Saved"
          : requestState === "error"
            ? "Request error"
            : isDirty
              ? "Unsaved changes"
              : "Clean";

  const saveButtonLabel =
    requestState === "saving"
      ? "Saving…"
      : requestState === "resetting"
        ? "Resetting…"
        : "Save draft";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <h1 className="text-lg font-semibold">Operations</h1>
      <Badge variant="outline">{dataSourceLabel}</Badge>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Badge variant={isDirty || requestState === "error" ? "secondary" : "outline"}>
          {statusLabel}
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
          {saveButtonLabel}
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
