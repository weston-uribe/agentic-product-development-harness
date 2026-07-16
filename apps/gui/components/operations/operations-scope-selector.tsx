import type { OperationsWorkflowScope } from "@harness/operations/types";
import { Label } from "@/components/ui/label";

type OperationsScopeSelectorProps = {
  scopes: OperationsWorkflowScope[];
  selectedScopeId?: string;
  disabled?: boolean;
  onScopeChange: (scopeId: string) => void;
};

export function OperationsScopeSelector({
  scopes,
  selectedScopeId,
  disabled = false,
  onScopeChange,
}: OperationsScopeSelectorProps) {
  if (scopes.length <= 1) {
    return null;
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="operations-scope-select" className="text-xs text-muted-foreground">
        Workflow scope
      </Label>
      <select
        id="operations-scope-select"
        className="max-w-md rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={selectedScopeId ?? scopes[0]?.id ?? ""}
        disabled={disabled}
        onChange={(event) => onScopeChange(event.target.value)}
      >
        {scopes.map((scope) => (
          <option key={scope.id} value={scope.id}>
            {scope.targetRepo}
          </option>
        ))}
      </select>
    </div>
  );
}
