"use client";

import { Button } from "@/components/ui/button";
import { RemoteActionConfirmation } from "@/components/custom/remote-action-confirmation";
import type { SettingsMutationPhase } from "@/lib/settings/settings-mutation";

type SettingsMutationPanelProps = {
  title?: string;
  previewSummary?: string | null;
  phase: SettingsMutationPhase;
  error?: string | null;
  successMessage?: string | null;
  confirmScope?:
    | "remote-secret-write"
    | "vercel-bridge-write"
    | "remote-repo-write"
    | "linear-write";
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  onPreview?: () => void;
  onApply?: () => void;
  previewLabel?: string;
  applyLabel?: string;
  disablePreview?: boolean;
  disableApply?: boolean;
};

export function SettingsMutationPanel({
  title = "Apply changes",
  previewSummary,
  phase,
  error,
  successMessage,
  confirmScope,
  confirmed,
  onConfirmedChange,
  onPreview,
  onApply,
  previewLabel = "Preview changes",
  applyLabel = "Apply changes",
  disablePreview = false,
  disableApply = false,
}: SettingsMutationPanelProps) {
  const busy = phase === "previewing" || phase === "applying";

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {previewSummary ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
          {previewSummary}
        </pre>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {successMessage ? (
        <p className="text-sm text-muted-foreground">{successMessage}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {onPreview ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy || disablePreview}
            onClick={onPreview}
          >
            {phase === "previewing" ? "Previewing…" : previewLabel}
          </Button>
        ) : null}
        {onApply ? (
          <Button
            type="button"
            disabled={busy || disableApply || (confirmScope ? !confirmed : false)}
            onClick={onApply}
          >
            {phase === "applying" ? "Applying…" : applyLabel}
          </Button>
        ) : null}
      </div>
      {confirmScope ? (
        <RemoteActionConfirmation
          scope={confirmScope}
          variant="advanced"
          confirmed={confirmed}
          disabled={busy}
          onConfirmedChange={onConfirmedChange}
        />
      ) : null}
    </div>
  );
}
