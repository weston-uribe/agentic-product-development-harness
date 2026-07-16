import type { OperationsValidationIssue, OperationsValidationResult } from "@harness/operations/types";

type OperationsIssuesPanelProps = {
  validation: OperationsValidationResult;
  onIssueClick?: (issue: OperationsValidationIssue) => void;
};

export function OperationsIssuesPanel({
  validation,
  onIssueClick,
}: OperationsIssuesPanelProps) {
  const items = [
    ...validation.errors.map((item) => ({ ...item, severity: "error" as const })),
    ...validation.warnings.map((item) => ({ ...item, severity: "warning" as const })),
  ];

  const errorCount = validation.errors.length;
  const warningCount = validation.warnings.length;

  return (
    <section className="space-y-2" aria-label="Issues">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Issues</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {errorCount > 0 ? (
            <span className="text-destructive">{errorCount} error{errorCount === 1 ? "" : "s"}</span>
          ) : null}
          {warningCount > 0 ? (
            <span className="text-amber-600 dark:text-amber-400">
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {errorCount === 0 && warningCount === 0 ? <span>None</span> : null}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No issues found.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
          {items.map((item, index) => (
            <li
              key={`${index}-${item.id}-${item.path ?? ""}-${item.canonicalStatusKey ?? ""}-${item.phaseKey ?? ""}`}
            >
              {onIssueClick && item.canonicalStatusKey ? (
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-accent ${
                    item.severity === "error"
                      ? "text-destructive"
                      : "text-amber-700 dark:text-amber-300"
                  }`}
                  onClick={() => onIssueClick(item)}
                >
                  {item.message}
                </button>
              ) : (
                <span
                  className={
                    item.severity === "error"
                      ? "block px-2 py-1.5 text-destructive"
                      : "block px-2 py-1.5 text-amber-700 dark:text-amber-300"
                  }
                >
                  {item.message}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
