import { CheckCircle2, Circle, XCircle } from "lucide-react";

import { SPACING } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type ChecklistItemStatus = "pending" | "complete" | "blocked";

interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
  status?: ChecklistItemStatus;
}

interface SetupChecklistProps {
  items: ChecklistItem[];
  className?: string;
}

function checklistIcon(status: ChecklistItemStatus | undefined) {
  switch (status) {
    case "complete":
      return CheckCircle2;
    case "blocked":
      return XCircle;
    default:
      return Circle;
  }
}

function checklistIconClass(status: ChecklistItemStatus | undefined): string {
  switch (status) {
    case "complete":
      return "text-emerald-600";
    case "blocked":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function SetupChecklist({ items, className }: SetupChecklistProps) {
  return (
    <ul className={cn(SPACING.list, className)}>
      {items.map((item) => {
        const Icon = checklistIcon(item.status);
        return (
          <li
            key={item.id}
            className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3"
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                checklistIconClass(item.status),
              )}
            />
            <div className={SPACING.stackSm}>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface DoctorChecklistProps {
  checks: Array<{
    label: string;
    ok: boolean;
    detail?: string;
    skipped?: boolean;
  }>;
  className?: string;
}

export function DoctorChecklist({ checks, className }: DoctorChecklistProps) {
  return (
    <ul className={cn(SPACING.list, className)}>
      {checks.map((check) => {
        const Icon = check.skipped
          ? Circle
          : check.ok
            ? CheckCircle2
            : XCircle;
        const iconClass = check.skipped
          ? "text-muted-foreground"
          : check.ok
            ? "text-emerald-600"
            : "text-destructive";

        return (
          <li key={check.label} className="flex items-start gap-3">
            <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
            <div className={SPACING.stackSm}>
              <p className="text-sm font-medium">{check.label}</p>
              {check.detail ? (
                <p className="text-sm text-muted-foreground">{check.detail}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
