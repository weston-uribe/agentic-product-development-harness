"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchCursorUsageAnalytics,
  fetchCursorUsageConfig,
  fetchCursorUsageStatus,
  postCursorUsageApply,
  postCursorUsagePreflight,
  type AnalyticsResponse,
  type CursorUsageConfigResponse,
  type ImportStatusResponse,
  type PreflightResponse,
} from "@/lib/cursor-usage-client";
import { UploadPanel } from "./UploadPanel";
import { ExportWindowFields } from "./ExportWindowFields";
import { PreflightTable } from "./PreflightTable";
import { ApplyConfirm } from "./ApplyConfirm";
import { ResultsPanel } from "./ResultsPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";

interface CursorUsagePageProps {
  nonce: string | null;
}

export function CursorUsagePage({ nonce }: CursorUsagePageProps) {
  const [config, setConfig] = useState<CursorUsageConfigResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [status, setStatus] = useState<ImportStatusResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAnalytics = useCallback(async () => {
    try {
      const next = await fetchCursorUsageAnalytics();
      setAnalytics(next);
    } catch {
      // analytics are supplementary
    }
  }, []);

  useEffect(() => {
    void fetchCursorUsageConfig()
      .then(setConfig)
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Could not load configuration.",
        );
      });
    void refreshAnalytics();
  }, [refreshAnalytics]);

  const recoverStatus = useCallback(
    async (importId: string) => {
      try {
        const next = await fetchCursorUsageStatus(importId);
        if (next) {
          setStatus(next);
        }
      } catch {
        // ignore recovery errors
      }
    },
    [],
  );

  useEffect(() => {
    const stored = window.sessionStorage.getItem("cursor-usage-import-id");
    if (stored) {
      void recoverStatus(stored);
    }
  }, [recoverStatus]);

  const runPreflight = async () => {
    if (!nonce) {
      setError("Security token unavailable. Reload the page.");
      return;
    }
    if (!file) {
      setError("Select a CSV file first.");
      return;
    }
    if (!exportStart || !exportEnd) {
      setError("Export window start and end are required.");
      return;
    }
    setBusy(true);
    setError(null);
    setConfirmed(false);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("exportStart", exportStart);
      formData.set("exportEnd", exportEnd);
      formData.set("timezone", timezone);
      const result = await postCursorUsagePreflight(formData, nonce);
      setPreflight(result);
      window.sessionStorage.setItem("cursor-usage-import-id", result.importId);
      const nextStatus = await fetchCursorUsageStatus(result.importId);
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preflight failed.");
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    if (!nonce || !preflight || applying) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      await postCursorUsageApply(
        {
          importId: preflight.importId,
          fingerprint: preflight.fingerprint,
          confirmed: true,
        },
        nonce,
      );
      const nextStatus = await fetchCursorUsageStatus(preflight.importId);
      setStatus(nextStatus);
      await refreshAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  };

  const exportWindowReady = exportStart.trim().length > 0 && exportEnd.trim().length > 0;
  const hasConflicts = (preflight?.conflicts.length ?? 0) > 0;
  const alreadyVerified = status?.verified === true;

  return (
    <div className="space-y-6" data-testid="cursor-usage-page">
      <div
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        data-testid="cursor-usage-langfuse-banner"
      >
        Importing Cursor usage scores does not repair the historical native
        Langfuse generation cost dashboard. It only adds deterministic phase
        trace scores from CSV attribution.
      </div>

      {config ? (
        <p className="text-sm text-muted-foreground">
          Namespace: <span className="font-medium text-foreground">{config.namespace}</span>
          {config.environment ? (
            <>
              {" "}
              · Environment:{" "}
              <span className="font-medium text-foreground">{config.environment}</span>
            </>
          ) : null}
          {config.adminKeyConfigured ? (
            <>
              {" "}
              · Admin API key configured (bulk API import not yet exposed in GUI)
            </>
          ) : null}
        </p>
      ) : null}

      <UploadPanel
        file={file}
        disabled={busy || applying}
        onFileSelected={setFile}
      />

      <ExportWindowFields
        exportStart={exportStart}
        exportEnd={exportEnd}
        timezone={timezone}
        disabled={busy || applying}
        onExportStartChange={setExportStart}
        onExportEndChange={setExportEnd}
        onTimezoneChange={setTimezone}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={busy || applying || !file || !exportWindowReady}
          onClick={() => void runPreflight()}
          data-testid="cursor-usage-preflight-button"
        >
          {busy ? "Running preflight…" : "Run preflight"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {preflight ? (
        <>
          <PreflightTable rows={preflight.rows} />
          <ApplyConfirm
            confirmed={confirmed}
            disabled={
              applying ||
              alreadyVerified ||
              !preflight.sourceScopeComplete ||
              hasConflicts ||
              preflight.bundleCount === 0
            }
            applying={applying}
            onConfirmedChange={setConfirmed}
            onApply={() => void runApply()}
          />
        </>
      ) : null}

      <ResultsPanel status={status} publicSummary={preflight?.publicSummary ?? null} />
      <AnalyticsPanel analytics={analytics} />
    </div>
  );
}
