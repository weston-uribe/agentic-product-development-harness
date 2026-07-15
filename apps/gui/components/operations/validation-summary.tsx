import type { OperationsValidationResult } from "@harness/operations/types";

type ValidationSummaryProps = {
  validation: OperationsValidationResult;
};

export function ValidationSummary({ validation }: ValidationSummaryProps) {
  const items = [
    ...validation.errors.map((item) => ({ ...item, severity: "error" as const })),
    ...validation.warnings.map((item) => ({ ...item, severity: "warning" as const })),
    ...validation.infos.map((item) => ({ ...item, severity: "info" as const })),
  ];

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-3 text-sm">
        No validation issues.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-medium">Validation</h2>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.id + (item.path ?? "") + (item.ruleId ?? "")}>
            <span
              className={
                item.severity === "error"
                  ? "text-destructive"
                  : item.severity === "warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              }
            >
              [{item.severity}] {item.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
