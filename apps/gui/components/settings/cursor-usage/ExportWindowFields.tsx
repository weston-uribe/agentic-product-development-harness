"use client";

interface ExportWindowFieldsProps {
  exportStart: string;
  exportEnd: string;
  timezone: string;
  disabled?: boolean;
  onExportStartChange: (value: string) => void;
  onExportEndChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
}

export function ExportWindowFields({
  exportStart,
  exportEnd,
  timezone,
  disabled = false,
  onExportStartChange,
  onExportEndChange,
  onTimezoneChange,
}: ExportWindowFieldsProps) {
  return (
    <fieldset
      className="grid gap-4 rounded-md border p-4 sm:grid-cols-3"
      data-testid="cursor-usage-export-window"
    >
      <legend className="px-1 text-sm font-medium">Export window</legend>
      <label className="grid gap-1 text-sm">
        <span>Start (ISO)</span>
        <input
          type="text"
          required
          className="h-9 rounded-md border bg-background px-3"
          value={exportStart}
          disabled={disabled}
          placeholder="2026-07-19T00:00:00.000Z"
          data-testid="cursor-usage-export-start"
          onChange={(event) => onExportStartChange(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>End (ISO)</span>
        <input
          type="text"
          required
          className="h-9 rounded-md border bg-background px-3"
          value={exportEnd}
          disabled={disabled}
          placeholder="2026-07-19T23:59:59.000Z"
          data-testid="cursor-usage-export-end"
          onChange={(event) => onExportEndChange(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Timezone</span>
        <input
          type="text"
          className="h-9 rounded-md border bg-background px-3"
          value={timezone}
          disabled={disabled}
          data-testid="cursor-usage-export-timezone"
          onChange={(event) => onTimezoneChange(event.target.value)}
        />
      </label>
    </fieldset>
  );
}
