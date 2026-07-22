import "server-only";

import path from "node:path";
import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";
import { loadHarnessDotenv } from "@harness/config/load-dotenv";
import { loadHarnessConfig } from "@harness/config/load-config";
import { resolveEvaluationConfig } from "@harness/evaluation/runtime.js";
import {
  preflightCsvImport,
  applyCsvImport,
  getImportStatus,
  getAnalyticsFromLedgers,
  type ImportAnalytics,
} from "@harness/evaluation/cursor-usage-import/service.js";
import {
  attributeSegmentsToCandidates,
  buildSegmentsFromCanonicalEvents,
} from "@harness/evaluation/cursor-usage-import/attribution.js";
import { discoverUsageCandidates } from "@harness/evaluation/cursor-usage-import/discovery.js";
import { createLangfuseApiClient } from "@harness/evaluation/langfuse-inspect/client.js";
import type { ExportWindow } from "@harness/evaluation/cursor-usage-import/canonical.js";
import type { AttributionState } from "@harness/evaluation/cursor-usage-import/attribution.js";
import { validateExportWindow } from "@harness/evaluation/cursor-usage-import/source-scope.js";
import { readStagingArtifacts } from "@harness/evaluation/cursor-usage-import/staging.js";

export interface PublicPreflightRow {
  cloudAgentIdHash: string;
  state: "matched" | "conflict" | "unresolved";
  phase: string | null;
  reason: string | null;
}

export interface CursorUsageServerContext {
  logDirectory: string;
  namespace: string;
  environment: string | null;
  langfuseConfigured: boolean;
  adminKeyConfigured: boolean;
}

function mapAttributionState(
  state: AttributionState,
): "matched" | "conflict" | "unresolved" {
  if (state === "matched") return "matched";
  if (state === "ambiguous" || state === "conflict") return "conflict";
  return "unresolved";
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
  const evalResolved = resolveEvaluationConfig(process.env);
  const namespace =
    process.env.P_DEV_EVALUATION_NAMESPACE?.trim() ||
    (evalResolved.ok ? evalResolved.config.namespace : "default");
  const environment =
    evalResolved.ok && evalResolved.config.tracingEnvironment
      ? evalResolved.config.tracingEnvironment
      : process.env.P_DEV_EVALUATION_ENVIRONMENT?.trim() ?? null;
  return {
    logDirectory,
    namespace,
    environment,
    langfuseConfigured: evalResolved.ok,
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
    precision: "second",
    boundsSource: "operator_gui_fields",
  };
}

export async function buildPublicPreflightRows(params: {
  logDirectory: string;
  importId: string;
  namespace: string;
  environment?: string | null;
}): Promise<{ rows: PublicPreflightRow[]; conflicts: string[] }> {
  const staged = await readStagingArtifacts(params.logDirectory, params.importId);
  if (!staged) {
    return { rows: [], conflicts: [] };
  }

  const exportValidation = validateExportWindow(staged.preflight.exportWindow);
  const segments = buildSegmentsFromCanonicalEvents(staged.canonicalEvents);
  let candidates: Awaited<ReturnType<typeof discoverUsageCandidates>>["candidates"] =
    [];

  if (exportValidation.ok) {
    const evalResolved = resolveEvaluationConfig(process.env);
    if (evalResolved.ok) {
      const client = await createLangfuseApiClient(evalResolved.config);
      const discovered = await discoverUsageCandidates({
        client,
        namespace: params.namespace,
        environment: params.environment ?? undefined,
        fromTimestamp: exportValidation.window.startIso,
        toTimestamp: exportValidation.window.endIso,
      });
      candidates = discovered.candidates;
    }
  }

  const attributed = attributeSegmentsToCandidates({
    segments,
    candidates,
    canonicalEvents: staged.canonicalEvents,
  });

  const rows: PublicPreflightRow[] = attributed.map((row) => ({
    cloudAgentIdHash: row.segment.cloudAgentIdHash,
    state: mapAttributionState(row.state),
    phase: row.candidate?.phase ?? null,
    reason: row.reason ?? null,
  }));

  const conflicts = attributed
    .filter((row) => row.state === "ambiguous" || row.state === "conflict")
    .map((row) => row.reason ?? `segment_${row.state}`);

  return { rows, conflicts };
}

export async function runPreflightCsvImport(params: {
  csvBytes: Buffer;
  exportWindow: ExportWindow;
}) {
  const ctx = await resolveCursorUsageServerContext();
  const result = await preflightCsvImport({
    csvBytes: params.csvBytes,
    exportWindow: params.exportWindow,
    namespace: ctx.namespace,
    environment: ctx.environment ?? undefined,
    logDirectory: ctx.logDirectory,
  });
  const { rows, conflicts } = await buildPublicPreflightRows({
    logDirectory: ctx.logDirectory,
    importId: result.importId,
    namespace: ctx.namespace,
    environment: ctx.environment,
  });
  return { ...result, rows, conflicts };
}

export async function runApplyCsvImport(params: {
  importId: string;
  fingerprint: string;
}) {
  const ctx = await resolveCursorUsageServerContext();
  return applyCsvImport({
    importId: params.importId,
    fingerprint: params.fingerprint,
    confirmed: true,
    logDirectory: ctx.logDirectory,
    namespace: ctx.namespace,
    environment: ctx.environment ?? undefined,
  });
}

export async function readImportStatus(importId: string) {
  const ctx = await resolveCursorUsageServerContext();
  return getImportStatus(ctx.logDirectory, importId);
}

export async function readImportAnalytics(): Promise<
  ImportAnalytics & { completeness: "local_ledger" | "langfuse" | "partial" }
> {
  const ctx = await resolveCursorUsageServerContext();
  const analytics = await getAnalyticsFromLedgers(ctx.logDirectory);
  let completeness: "local_ledger" | "langfuse" | "partial" = "partial";
  if (analytics.ledgerCount === 0) {
    completeness = ctx.langfuseConfigured ? "langfuse" : "local_ledger";
  } else if (ctx.langfuseConfigured && analytics.verifiedCount > 0) {
    completeness = "langfuse";
  } else if (analytics.ledgerCount > 0) {
    completeness = "local_ledger";
  }
  return { ...analytics, completeness };
}
