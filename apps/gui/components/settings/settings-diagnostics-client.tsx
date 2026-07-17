"use client";

import { useState } from "react";
import type { SetupGuiViewModel } from "@harness/setup/gui-view-model";
import { DoctorChecklist } from "@/components/custom/setup-checklist";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/custom/section-card";

type SettingsDiagnosticsClientProps = {
  initialDoctor: SetupGuiViewModel["doctor"];
  lastCheckedAt: string | null;
};

export function SettingsDiagnosticsClient({
  initialDoctor,
  lastCheckedAt,
}: SettingsDiagnosticsClientProps) {
  const [doctor, setDoctor] = useState(initialDoctor);
  const [checkedAt, setCheckedAt] = useState(lastCheckedAt);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runChecks = async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/diagnostics", { method: "POST" });
      const payload = (await response.json()) as {
        doctor?: SetupGuiViewModel["doctor"];
        checkedAt?: string;
        error?: string;
      };
      if (!response.ok || !payload.doctor) {
        throw new Error(payload.error ?? "Diagnostics run failed.");
      }
      setDoctor(payload.doctor);
      setCheckedAt(payload.checkedAt ?? new Date().toISOString());
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Diagnostics run failed.",
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Diagnostics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cached local checks are shown on load. Run checks to refresh doctor results.
          </p>
          {checkedAt ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last checked: {new Date(checkedAt).toLocaleString()}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No checks run this session.</p>
          )}
        </div>
        <Button type="button" variant="outline" disabled={running} onClick={() => void runChecks()}>
          {running ? "Running checks…" : "Run checks"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <SectionCard title="Doctor checks" description={doctor.remoteChecksNote}>
        <DoctorChecklist checks={doctor.checks} />
      </SectionCard>
    </div>
  );
}
