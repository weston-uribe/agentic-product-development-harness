"use client";

import { FORM } from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type RemoteConfirmationScope = "remote-secret-write" | "remote-repo-write";

interface RemoteActionConfirmationProps {
  scope: RemoteConfirmationScope;
  confirmed: boolean;
  disabled?: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
}

const COPY: Record<
  RemoteConfirmationScope,
  { title: string; bullets: string[]; label: string }
> = {
  "remote-secret-write": {
    title: "Confirm harness repo Actions secret writes",
    bullets: [
      "Writes encrypted GitHub Actions secrets to the harness dispatch repo only.",
      "HARNESS_CONFIG_JSON_B64 is generated server-side from local config.",
      "Secret values are never returned in previews, results, or errors.",
      "No target repo branches, PRs, Linear writes, or harness phases will run.",
    ],
    label:
      "I reviewed the harness secret preview and want to write these Actions secrets.",
  },
  "remote-repo-write": {
    title: "Confirm target workflow branch and PR install",
    bullets: [
      "Creates or updates an install branch and opens or reuses a PR.",
      "Never writes directly to the target repo production or main branch.",
      "No harness repo secret writes, Linear writes, or harness phases will run.",
    ],
    label:
      "I reviewed the workflow preview and want to create or update the install PR.",
  },
};

export function RemoteActionConfirmation({
  scope,
  confirmed,
  disabled = false,
  onConfirmedChange,
}: RemoteActionConfirmationProps) {
  const copy = COPY[scope];

  return (
    <div className={FORM.confirmationBox}>
      <p className="text-sm font-medium">{copy.title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {copy.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`confirm-${scope}`}
          checked={confirmed}
          disabled={disabled}
          onChange={(event) => onConfirmedChange(event.target.checked)}
        />
        <Label htmlFor={`confirm-${scope}`} className="text-sm leading-snug">
          {copy.label}
        </Label>
      </div>
    </div>
  );
}
