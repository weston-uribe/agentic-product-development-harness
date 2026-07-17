import Link from "next/link";
import { SectionCard } from "@/components/custom/section-card";

type SummaryRow = {
  label: string;
  value: string;
};

type SettingsSummarySectionProps = {
  title: string;
  description: string;
  rows: SummaryRow[];
  editHref?: string;
  editLabel?: string;
};

export function SettingsSummarySection({
  title,
  description,
  rows,
  editHref,
  editLabel = "View details",
}: SettingsSummarySectionProps) {
  return (
    <SectionCard title={title} description={description}>
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)]">
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>
      {editHref ? (
        <p className="pt-2 text-sm">
          <Link href={editHref} className="font-medium text-primary underline-offset-4 hover:underline">
            {editLabel}
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}
