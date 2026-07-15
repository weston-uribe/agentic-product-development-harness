import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ExecutorMaturityBadgeProps = {
  maturity?: string;
};

export function ExecutorMaturityBadge({ maturity }: ExecutorMaturityBadgeProps) {
  if (!maturity || maturity === "implemented" || maturity === "system") {
    return null;
  }

  const label =
    maturity === "planned"
      ? "Planned"
      : maturity === "human"
        ? "Human"
        : maturity;

  return (
    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
      {label}
    </Badge>
  );
}
