"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/custom/section-card";
import { SPACING } from "@/lib/constants";
import { OBSERVABILITY_LOCAL_FILE } from "@harness/observability/constants.js";

type ConsentPreference = "enabled" | "disabled" | null;

interface PreferencesResponse {
  analyticsPreference: ConsentPreference;
  errorReportingPreference: ConsentPreference;
  disclosureShown: boolean;
  hasInstallationId: boolean;
}

async function readPreferences(): Promise<PreferencesResponse> {
  const response = await fetch("/api/observability/preferences", {
    method: "GET",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error("Could not load observability preferences.");
  }
  return (await response.json()) as PreferencesResponse;
}

async function writePreferences(
  body: Record<string, unknown>,
  nonce: string,
): Promise<PreferencesResponse> {
  const response = await fetch("/api/observability/preferences", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-p-dev-observability-nonce": nonce,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("Could not save observability preferences.");
  }
  return (await response.json()) as PreferencesResponse;
}

interface ObservabilitySettingsCardProps {
  nonce: string | null;
  onAnalyticsEnabled?: () => void;
}

export function ObservabilitySettingsCard({
  nonce,
  onAnalyticsEnabled,
}: ObservabilitySettingsCardProps) {
  const [preferences, setPreferences] = useState<PreferencesResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readPreferences()
      .then(setPreferences)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load observability preferences.",
        );
      });
  }, []);

  const persist = useCallback(
    async (body: Record<string, unknown>) => {
      if (!nonce) {
        setError("Observability security token is unavailable.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const next = await writePreferences(body, nonce);
        setPreferences(next);
        if (body.analyticsPreference === "enabled") {
          onAnalyticsEnabled?.();
        }
      } catch (saveError: unknown) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Could not save observability preferences.",
        );
      } finally {
        setSaving(false);
      }
    },
    [nonce, onAnalyticsEnabled],
  );

  const analyticsEnabled = preferences?.analyticsPreference === "enabled";
  const errorReportingEnabled =
    preferences?.errorReportingPreference === "enabled";

  return (
    <SectionCard
      title="Privacy and optional telemetry"
      description="No network telemetry is sent until you choose. These preferences are stored locally only."
    >
      <div className={SPACING.stackSm}>
        <p className="text-sm text-muted-foreground">
          Local state file: <code>{OBSERVABILITY_LOCAL_FILE}</code>
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={analyticsEnabled}
            disabled={saving || !nonce}
            onChange={(event) =>
              void persist({
                analyticsPreference: event.target.checked ? "enabled" : "disabled",
                disclosureShown: true,
              })
            }
          />
          Anonymous product analytics (Configure funnel and provisioning outcomes)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={errorReportingEnabled}
            disabled={saving || !nonce}
            onChange={(event) =>
              void persist({
                errorReportingPreference: event.target.checked
                  ? "enabled"
                  : "disabled",
                disclosureShown: true,
              })
            }
          />
          Automated sanitized error reports
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || !nonce}
            onClick={() =>
              void persist({
                analyticsPreference: "disabled",
                errorReportingPreference: "disabled",
                disclosureShown: true,
              })
            }
          >
            Disable all telemetry
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving || !nonce}
            onClick={() => void persist({ reset: true })}
          >
            Reset local telemetry identity
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </SectionCard>
  );
}
