"use client";

import { FORM } from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { LocalFileWritePlan } from "@harness/setup/local-apply-actions";

interface LocalWriteConfirmationProps {
  plan?: LocalFileWritePlan;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  disabled?: boolean;
}

export function LocalWriteConfirmation({
  plan,
  confirmed,
  onConfirmedChange,
  disabled = false,
}: LocalWriteConfirmationProps) {
  return (
    <div className={FORM.confirmationBox}>
      <p className="text-sm font-medium">Confirm local file writes</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          .env.local — {plan?.envAction === "update" ? "update" : "create"}
        </li>
        <li>
          .harness/config.local.json —{" "}
          {plan?.configAction === "update" ? "update" : "create"}
        </li>
        <li>Files are local, gitignored, and written only on this machine.</li>
        <li>
          No GitHub Actions secrets, target repo workflows, Linear writes, cloud
          workflow dispatch, tags, releases, settings, or live harness phases will
          run.
        </li>
      </ul>
      <div className="flex items-start gap-3">
        <Checkbox
          id="confirm-local-write"
          checked={confirmed}
          disabled={disabled}
          onChange={(event) => onConfirmedChange(event.target.checked)}
        />
        <Label htmlFor="confirm-local-write" className="text-sm leading-snug">
          I reviewed the redacted preview and want to write these local setup
          files.
        </Label>
      </div>
    </div>
  );
}
