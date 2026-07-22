import "server-only";

import path from "node:path";
import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";
import { loadHarnessDotenv } from "@harness/config/load-dotenv";
import { loadHarnessConfig } from "@harness/config/load-config";
import {
  preflightCsvImport,
  applyCsvImport,
  getImportStatus,
  getAnalyticsFromLedgers,
  type ImportAnalytics,
} from "@harness/evaluation/cursor-usage-import/service.js";
import {
  CursorUsageDiscoveryError,
  resolveCursorUsageDiscoveryConfig,
  type CursorUsageDiscoveryPublicConfig,
} from "@harness/evaluation/cursor-usage-import/discovery-config.js";
import type { ExportWindow } from "@harness/evaluation/cursor-usage-import/canonical.js";
import { readStagingArtifacts } from "@harness/evaluation/cursor-usage-import/staging.js";
import { inspectCursorUsageCsvSource } from "@harness/evaluation/cursor-usage-import/source-inspection.js";
import type { TimestampDisambiguationPolicy } from "@harness/evaluation/cursor-usage-import/timestamps.js";
import type { PublicPreflightAttributionRow } from "@harness/evaluation/cursor-usage-import/staging.js";

export type PublicPreflightRow = PublicPreflightAttributionRow;

export interface CursorUsageServerContext {
  logDirectory: string;
  discovery: CursorUsageDiscoveryPublicConfig;
  adminKeyConfigured: boolean;
}

async function resolveLogDirectory(cwd: string): Promise<string> {
  try {
    const { config } = await loadHarnessConfig({ baseDir: cwd });
    if (typeof config.logDirectory === "string" && config.logDirectory.trim()) {
      return path.resolve(cwd, config.logDirectory);
    }
  } catch {
    // fall through
  }
  return path.resolve(cwd, "runs");
}

export async function resolveCursorUsageServerContext(): Promise<CursorUsageServerContext> {
  const cwd = resolveHarnessWorkspaceDir();
  loadHarnessDotenv(cwd);
  const logDirectory = await resolveLogDirectory(cwd);
  const resolved = resolveCursorUsageDiscoveryConfig(process.env);
  return {
    logDirectory,
    discovery: resolved.publicConfig,
    adminKeyConfigured: Boolean(process.env.CURSOR_ADMIN_API_KEY?.trim()),
  };
}

export function buildExportWindow(params: {
  exportStart: string;
  exportEnd: string;
  exportTimezone?: string;
}): ExportWindow {
  return {
    startIso: params.exportStart.trim(),
    endIso: params.exportEnd.trim(),
    timezone: params.exportTimezone?.trim() || "UTC",
    precision: "millisecond",
    boundsSource: "operator_gui_fields",
  };
}

export function runCursorUsageInspect(params: {
  csvBytes: Buffer;
  assumedTimezone?: string | null;
  disambiguation?: TimestampDisambiguationPolicy;
}) {
  const raw = params.csvBytes.toString("utf8");
  return inspectCursorUsageCsvSource(raw, {
    assumedTimezone: params.assumedTimezone,
    disambiguation: params.disambiguation,
  });
}

/** Staging-only reader — never rediscovers or reattributes. */
export async function readPublicPreflightRows(params: {
  logDirectory: string;
  importId: string;
}): Promise<{ rows: PublicPreflightRow[]; conflicts: string[] }> {
  const staged = await readStagingArtifacts(params.logDirectory, params.importId);
  if (!staged) {
    return { rows: [], conflicts: [] };
  }
  return {
    rows: staged.publicSummary.attributionRows ?? [],
    conflicts: staged.publicSummary.conflictReasonCodes ?? [],
  };
}

/** @deprecated Use readPublicPreflightRows — does not rediscover. */
export const buildPublicPreflightRows = readPublicPreflightRows;

export async function runPreflightCsvImport(params: {
  csvBytes: Buffer;
  exportWindow: ExportWindow;
  assumedTimezone?: string | null;
  disambiguationPolicy?: TimestampDisambiguationPolicy;
  expectedSourceDigestSha256?: string | null;
  expectedInspectionToken?: string | null;
}) {
  const ctx = await resolveCursorUsageServerContext();
  if (ctx.discovery.configurationStatus !== "ready") {
    throw new CursorUsageDiscoveryError(
      ctx.discovery.errorCode ?? "langfuse_not_configured",
      ctx.discovery.errorMessage ??
        "Cursor usage Langfuse discovery is not configured.",
    );
  }
  const result = await preflightCsvImport({
    csvBytes: params.csvBytes,
    exportWindow: params.exportWindow,
    namespace: ctx.discovery.namespace!,
    environment: ctx.discovery.environmentFilter ?? undefined,
    logDirectory: ctx.logDirectory,
    assumedTimezone: params.assumedTimezone,
    disambiguationPolicy: params.disambiguationPolicy,
    expectedSourceDigestSha256: params.expectedSourceDigestSha256,
    expectedInspectionToken: params.expectedInspectionToken,
  });
  return {
    ...result,
    rows: result.rows,
    conflicts: result.conflicts,
    discoveryDiagnostics: result.discoveryDiagnostics,
  };
}

export async function runApplyCsvImport(params: {
  importId: string;
  fingerprint: string;
  preflightApprovalFingerprint?: string;
}) {
  const ctx = await resolveCursorUsageServerContext();
  if (ctx.discovery.configurationStatus !== "ready") {
    throw new CursorUsageDiscoveryError(
      ctx.discovery.errorCode ?? "langfuse_not_configured",
      ctx.discovery.errorMessage ??
        "Cursor usage Langfuse discovery is not configured.",
    );
  }
  return applyCsvImport({
    importId: params.importId,
    fingerprint: params.fingerprint,
    preflightApprovalFingerprint:
      params.preflightApprovalFingerprint ?? params.fingerprint,
    confirmed: true,
    logDirectory: ctx.logDirectory,
    namespace: ctx.discovery.namespace!,
    environment: ctx.discovery.environmentFilter ?? undefined,
  });
}

export async function readImportStatus(importId: string) {
  const ctx = await resolveCursorUsageServerContext();
  return getImportStatus(ctx.logDirectory, importId);
}

export async function readImportAnalytics(): Promise<ImportAnalytics> {
  const ctx = await resolveCursorUsageServerContext();
  return getAnalyticsFromLedgers(ctx.logDirectory);
}
