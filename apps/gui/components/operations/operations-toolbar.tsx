import { Button } from "@/components/ui/button";
import type { OperationsRequestState } from "@/lib/operations/reducer";

type OperationsToolbarProps = {
  requestState: OperationsRequestState;
  isDirty: boolean;
  saveMessage?: string;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  isRequestActive: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onReset: () => void;
  onFitView: () => void;
};

export function OperationsToolbar({
  requestState,
  isDirty,
  saveMessage,
  canUndo,
  canRedo,
  canSave,
  isRequestActive,
  sidebarCollapsed,
  onToggleSidebar,
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
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="lg:hidden"
        onClick={onToggleSidebar}
        disabled={isRequestActive}
      >
        {sidebarCollapsed ? "Panel" : "Close panel"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden lg:inline-flex"
        onClick={onToggleSidebar}
        disabled={isRequestActive}
      >
        {sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      </Button>
      <h1 className="text-base font-semibold">Operations</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md border px-2 py-0.5 text-xs ${
            isDirty || requestState === "error"
              ? "border-border bg-muted text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          {statusLabel}
        </span>
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onFitView}
          disabled={isRequestActive}
        >
          Fit view
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={isRequestActive}
        >
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
      </div>
      {saveMessage ? (
        <p className="w-full text-xs text-muted-foreground">{saveMessage}</p>
      ) : null}
    </div>
  );
}
