import type { OperationsWorkflowScope } from "@harness/operations/types";
import { Label } from "@/components/ui/label";

type OperationsScopeSelectorProps = {
  scopes: OperationsWorkflowScope[];
  selectedScopeId?: string;
  disabled?: boolean;
  legacyDraftReviewRequired?: boolean;
  onScopeChange: (scopeId: string) => void;
};

export function OperationsScopeSelector({
  scopes,
  selectedScopeId,
  disabled = false,
  legacyDraftReviewRequired = false,
  onScopeChange,
}: OperationsScopeSelectorProps) {
  if (scopes.length <= 1) {
    const onlyScope = scopes[0];
    if (!onlyScope) {
      return null;
    }
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Workflow scope</Label>
        <p className="text-sm font-medium">{onlyScope.targetRepo}</p>
        {legacyDraftReviewRequired ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            A legacy draft file needs manual review before it can be assigned to a repository scope.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="operations-scope-select" className="text-xs text-muted-foreground">
        Workflow scope
      </Label>
      <select
        id="operations-scope-select"
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
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
      {legacyDraftReviewRequired ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          A legacy draft file needs manual review before it can be assigned to a repository scope.
        </p>
      ) : null}
    </div>
  );
}
