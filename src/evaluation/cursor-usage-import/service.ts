import type { EvaluationRuntimeConfig } from "../types.js";
import { resolveEvaluationConfig } from "../runtime.js";
import {
  createLangfuseApiClient,
  fetchTraceScoresRawForImport,
  type LangfuseApiClient,
} from "../langfuse-inspect/client.js";
import { deriveScoreId } from "../identifiers.js";
import { hashCloudAgentId } from "./parse.js";
import { parseCsvSource } from "./sources/csv.js";
import { discoverUsageCandidates } from "./discovery.js";
import {
  attributeSegmentsToCandidates,
  buildSegmentsFromCanonicalEvents,
  bundleAttributedSegments,
} from "./attribution.js";
import {
  createImportId,
  fingerprintStaging,
  readStagingArtifacts,
  writeStagingArtifacts,
  listLedgers,
  type ImportLedgerEntry,
  type ImportLifecycleState,
  type StagingArtifacts,
} from "./staging.js";
import {
  withImportLock,
} from "./import-lock.js";
import { computeCostProxies } from "./proxy-cost.js";
import { projectUsageScoresOnly } from "./project.js";
import { createScoreOnlyClient } from "./score-client.js";
import { buildPhaseUsageScores } from "./scores.js";
import { evaluateSourceScope, validateExportWindow } from "./source-scope.js";
import { verifyImportedScores, type FetchedScore } from "./verify.js";
import { mapFetchedScores } from "./run.js";
import type { ExportWindow } from "./canonical.js";
import type { PhaseImportAttachment } from "./types.js";
import { CURSOR_USAGE_IMPORTER_VERSION } from "./types.js";
import { resolveCanonicalModelId } from "./model-aliases.js";
import { tokensSumValid } from "./parse.js";

export interface CursorUsageImportFilters {
  issueKeys?: string[];
  phases?: string[];
}

export interface PreflightCsvImportParams {
  csvBytes: Buffer | Uint8Array | string;
  exportWindow: ExportWindow | null;
  namespace: string;
  environment?: string;
  filters?: CursorUsageImportFilters;
  logDirectory: string;
  langfuseConfig?: EvaluationRuntimeConfig;
  /** When false, skip Langfuse discovery (offline staging / dry canary). Default true. */
  discoverLangfuse?: boolean;
  /** Bound discovery wait; fail closed to retrieval-incomplete on timeout. */
  discoveryTimeoutMs?: number;
  deps?: CursorUsageServiceDeps;
}

export interface ApplyCsvImportParams {
  importId: string;
  fingerprint: string;
  confirmed: true;
  logDirectory: string;
  namespace: string;
  environment?: string;
  langfuseConfig?: EvaluationRuntimeConfig;
  deps?: CursorUsageServiceDeps;
}

export interface ImportStatus {
  importId: string;
  lifecycle: ImportLifecycleState;
  fingerprint: string;
  sourceScopeComplete: boolean;
  bundleCount: number;
  verified: boolean;
  publicSummary: StagingArtifacts["publicSummary"] | null;
}

export interface ImportAnalytics {
  ledgerCount: number;
  verifiedCount: number;
  totalBundles: number;
  totalScores: number;
  byNamespace: Record<string, { imports: number; bundles: number }>;
}

export interface CursorUsageServiceDeps {
  createApiClient?: (
    config: EvaluationRuntimeConfig,
  ) => Promise<LangfuseApiClient>;
  createScoreClient?: typeof createScoreOnlyClient;
  resolveConfig?: typeof resolveEvaluationConfig;
  discover?: typeof discoverUsageCandidates;
  sleep?: (ms: number) => Promise<void>;
}

function publicAgentHash(cloudAgentId: string): string {
  return hashCloudAgentId(cloudAgentId);
}

function filterCandidates(
  candidates: Awaited<ReturnType<typeof discoverUsageCandidates>>["candidates"],
  filters?: CursorUsageImportFilters,
) {
  let out = candidates;
  if (filters?.issueKeys?.length) {
    const keys = new Set(filters.issueKeys.map((k) => k.trim()));
    out = out.filter((c) => keys.has(c.issueKey));
  }
  if (filters?.phases?.length) {
    const phases = new Set(filters.phases.map((p) => p.trim()));
    out = out.filter((c) => c.phase && phases.has(c.phase));
  }
  return out;
}

function buildAttachmentsFromBundles(params: {
  namespace: string;
  bundles: ReturnType<typeof bundleAttributedSegments>["bundles"];
  exportWindow: ExportWindow | null;
  langfuseRetrievalComplete: boolean;
  tokenArithmeticComplete: boolean;
  sourceDigestPrefix: string;
  environment?: string;
}): {
  attachments: PhaseImportAttachment[];
  sourceScopeComplete: boolean;
  sourceScopeIncompleteReason: string | null;
} {
  const attachments: PhaseImportAttachment[] = [];
  let sourceScopeComplete = false;
  let sourceScopeIncompleteReason: string | null = null;

  const exportValidation = validateExportWindow(params.exportWindow);
  if (!exportValidation.ok) {
    sourceScopeIncompleteReason = exportValidation.reason;
  }

  for (const bundle of params.bundles) {
    if (!tokensSumValid(bundle.tokens)) {
      sourceScopeIncompleteReason = "token_arithmetic_incomplete";
      continue;
    }
    const modelRaw =
      bundle.segmentBreakdown[0]?.modelRaw ??
      bundle.join.effectiveVariant ??
      "unknown";
    const modelId =
      resolveCanonicalModelId(modelRaw) ?? modelRaw.trim().toLowerCase();
    const proxies = computeCostProxies({
      modelId,
      effectiveVariant: bundle.join.effectiveVariant,
      tokens: bundle.tokens,
    });
    if (!proxies) {
      sourceScopeIncompleteReason = "pricing_lookup_failed";
      continue;
    }

    const scope = evaluateSourceScope({
      exportWindow: params.exportWindow,
      executionWindowStartIso: bundle.join.windowStart,
      executionWindowEndIso: bundle.join.windowEnd,
      agentSegments: bundle.segmentBreakdown,
      accountedSegmentFingerprints: new Set(bundle.matchedFingerprints),
      hasRejectedOrAmbiguousForAgent: false,
      langfuseRetrievalComplete: params.langfuseRetrievalComplete,
      tokenArithmeticComplete: params.tokenArithmeticComplete,
    });

    if (!scope.sourceScopeComplete) {
      sourceScopeIncompleteReason =
        sourceScopeIncompleteReason ?? scope.sourceScopeIncompleteReason;
    }

    const scores = buildPhaseUsageScores({
      namespace: params.namespace,
      join: bundle.join,
      tokens: bundle.tokens,
      knownNoncacheCostUsd: proxies.knownNoncacheCostUsd,
      allInputAtListRateUsd: proxies.allInputAtListRateUsd,
      tokenUsageComplete: scope.sourceScopeComplete,
      sourceScopeComplete: scope.sourceScopeComplete,
      listPriceEquivalentComplete: false,
      providerActualCostComplete: false,
      costProxyAvailable: true,
      sourceDigestPrefix: params.sourceDigestPrefix,
      environment: params.environment,
    });

    attachments.push({
      join: bundle.join,
      aggregate: {
        cloudAgentId: bundle.join.cursorAgentId,
        cloudAgentIdHash: publicAgentHash(bundle.join.cursorAgentId),
        rowCount: bundle.segmentBreakdown.reduce((n, s) => n + s.rowCount, 0),
        fingerprints: bundle.matchedFingerprints,
        models: [...new Set(bundle.segmentBreakdown.map((s) => s.modelRaw))],
        tokens: bundle.tokens,
        costCategories: {},
        timestampMin:
          bundle.segmentBreakdown
            .map((s) => s.timestampMin)
            .filter(Boolean)
            .sort()[0] ?? null,
        timestampMax:
          bundle.segmentBreakdown
            .map((s) => s.timestampMax)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
      },
      proxies,
      scores,
    });
  }

  sourceScopeComplete =
    attachments.length > 0 &&
    attachments.every((a) =>
      a.scores.some(
        (s) => s.name === "cursor_source_scope_complete" && s.value === true,
      ),
    );

  return { attachments, sourceScopeComplete, sourceScopeIncompleteReason };
}

async function resolveLangfuseClient(
  params: {
    langfuseConfig?: EvaluationRuntimeConfig;
    deps?: CursorUsageServiceDeps;
  },
): Promise<LangfuseApiClient | null> {
  const resolveConfig = params.deps?.resolveConfig ?? resolveEvaluationConfig;
  const resolved = params.langfuseConfig
    ? { ok: true as const, config: params.langfuseConfig }
    : resolveConfig(process.env);
  if (!resolved.ok) return null;
  const createApi =
    params.deps?.createApiClient ?? createLangfuseApiClient;
  return createApi(resolved.config);
}

function detectExistingScoreConflicts(
  attachments: PhaseImportAttachment[],
  existingScores: FetchedScore[],
): string[] {
  const mismatches: string[] = [];
  const byId = new Map(existingScores.map((s) => [s.id, s]));
  for (const attachment of attachments) {
    for (const score of attachment.scores) {
      const existing = byId.get(score.id);
      if (!existing) continue;
      const expected = score.value;
      const got = existing.value;
      if (expected !== got && String(expected) !== String(got)) {
        mismatches.push(`existing_score_value_conflict:${score.id}`);
      }
    }
  }
  return mismatches;
}

export async function preflightCsvImport(
  params: PreflightCsvImportParams,
): Promise<{
  importId: string;
  fingerprint: string;
  lifecycle: ImportLifecycleState;
  sourceScopeComplete: boolean;
  bundleCount: number;
  publicSummary: StagingArtifacts["publicSummary"];
}> {
  const importId = createImportId();
  const { events, digestSha256, parsed } = await parseCsvSource({
    buffer: params.csvBytes,
  });
  const fingerprint = fingerprintStaging({
    namespace: params.namespace,
    sourceDigestSha256: digestSha256,
    exportWindow: params.exportWindow,
  });

  const segments = buildSegmentsFromCanonicalEvents(events);
  const tokenArithmeticComplete = parsed.arithmetic.identityHolds;

  let candidates: Awaited<ReturnType<typeof discoverUsageCandidates>>["candidates"] =
    [];
  let langfuseRetrievalComplete = false;

  const exportValidation = validateExportWindow(params.exportWindow);
  const shouldDiscover = params.discoverLangfuse !== false;
  if (exportValidation.ok && shouldDiscover) {
    const client = await resolveLangfuseClient(params);
    if (client) {
      const discoverFn = params.deps?.discover ?? discoverUsageCandidates;
      const timeoutMs = params.discoveryTimeoutMs ?? 25_000;
      try {
        const discovered = await Promise.race([
          discoverFn({
            client,
            namespace: params.namespace,
            environment: params.environment,
            fromTimestamp: exportValidation.window.startIso,
            toTimestamp: exportValidation.window.endIso,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("langfuse_discovery_timeout")),
              timeoutMs,
            ),
          ),
        ]);
        candidates = filterCandidates(discovered.candidates, params.filters);
        langfuseRetrievalComplete = discovered.retrievalComplete;
      } catch {
        candidates = [];
        langfuseRetrievalComplete = false;
      }
    }
  }

  const attributed = attributeSegmentsToCandidates({
    segments,
    candidates,
    canonicalEvents: events,
  });
  const { bundles, skipped } = bundleAttributedSegments({
    attributed,
    namespace: params.namespace,
  });
  void skipped;

  const built = buildAttachmentsFromBundles({
    namespace: params.namespace,
    bundles,
    exportWindow: params.exportWindow,
    langfuseRetrievalComplete,
    tokenArithmeticComplete,
    sourceDigestPrefix: digestSha256,
    environment: params.environment,
  });

  const lifecycle: ImportLifecycleState = built.sourceScopeComplete
    ? "ready"
    : "preflighted";

  const preparedAt = new Date().toISOString();
  const publicSummary: StagingArtifacts["publicSummary"] = {
    schemaVersion: 1,
    kind: "cursor_usage_import_staging_public",
    importId,
    preparedAt,
    importerVersion: CURSOR_USAGE_IMPORTER_VERSION,
    lifecycle,
    namespace: params.namespace,
    sourceDigestPrefix: digestSha256.slice(0, 16),
    bundleCount: bundles.length,
    sourceScopeComplete: built.sourceScopeComplete,
    observationMutationAttempted: false,
  };

  const preflight = {
    schemaVersion: 1 as const,
    importId,
    preparedAt,
    importerVersion: CURSOR_USAGE_IMPORTER_VERSION,
    namespace: params.namespace,
    environment: params.environment?.trim() ?? null,
    sourceDigestSha256: digestSha256,
    exportWindow: params.exportWindow,
    fingerprint,
    lifecycle,
    candidateCount: candidates.length,
    bundleCount: bundles.length,
    sourceScopeComplete: built.sourceScopeComplete,
    sourceScopeIncompleteReason: built.sourceScopeIncompleteReason,
    canonicalEventCount: events.length,
  };

  const ledger: ImportLedgerEntry = {
    schemaVersion: 1,
    importId,
    recordedAt: preparedAt,
    lifecycle,
    namespace: params.namespace,
    sourceDigestSha256: digestSha256,
    exportWindow: params.exportWindow,
    bundleCount: bundles.length,
    scoreCount: 0,
    verified: false,
    sourceScopeComplete: built.sourceScopeComplete,
  };

  await writeStagingArtifacts(params.logDirectory, importId, {
    canonicalEvents: events,
    preflight,
    publicSummary,
    ledger,
  });

  return {
    importId,
    fingerprint,
    lifecycle,
    sourceScopeComplete: built.sourceScopeComplete,
    bundleCount: bundles.length,
    publicSummary,
  };
}

export async function applyCsvImport(
  params: ApplyCsvImportParams,
): Promise<{
  lifecycle: ImportLifecycleState;
  verified: boolean;
  scoreCount: number;
  conflicts: string[];
  verifyMismatches: string[];
}> {
  if (params.confirmed !== true) {
    throw new Error("applyCsvImport requires confirmed: true");
  }

  const staged = await readStagingArtifacts(
    params.logDirectory,
    params.importId,
  );
  if (!staged) {
    throw new Error(`import_not_found:${params.importId}`);
  }
  if (staged.preflight.fingerprint !== params.fingerprint) {
    throw new Error("import_fingerprint_mismatch");
  }

  const events = staged.canonicalEvents;
  const segments = buildSegmentsFromCanonicalEvents(events);
  const exportWindow = staged.preflight.exportWindow;

  const exportValidation = validateExportWindow(exportWindow);
  if (!exportValidation.ok) {
    throw new Error(`source_scope_incomplete:${exportValidation.reason}`);
  }

  const client = await resolveLangfuseClient(params);
  if (!client) {
    throw new Error("langfuse_unavailable");
  }

  const discoverFn = params.deps?.discover ?? discoverUsageCandidates;
  const discovered = await discoverFn({
    client,
    namespace: params.namespace,
    environment: params.environment,
    fromTimestamp: exportValidation.window.startIso,
    toTimestamp: exportValidation.window.endIso,
  });

  const attributed = attributeSegmentsToCandidates({
    segments,
    candidates: discovered.candidates,
    canonicalEvents: events,
  });
  const { bundles } = bundleAttributedSegments({
    attributed,
    namespace: params.namespace,
  });

  const built = buildAttachmentsFromBundles({
    namespace: params.namespace,
    bundles,
    exportWindow,
    langfuseRetrievalComplete: discovered.retrievalComplete,
    tokenArithmeticComplete: true,
    sourceDigestPrefix: staged.preflight.sourceDigestSha256,
    environment: params.environment ?? staged.preflight.environment ?? undefined,
  });

  if (!built.sourceScopeComplete) {
    const lifecycle: ImportLifecycleState = "incomplete";
    await writeStagingArtifacts(params.logDirectory, params.importId, {
      ...staged,
      preflight: { ...staged.preflight, lifecycle },
      publicSummary: {
        ...staged.publicSummary,
        lifecycle,
        sourceScopeComplete: false,
      },
      ledger: {
        ...staged.ledger,
        lifecycle,
        sourceScopeComplete: false,
        recordedAt: new Date().toISOString(),
      },
    });
    throw new Error(
      `source_scope_incomplete:${built.sourceScopeIncompleteReason ?? "unknown"}`,
    );
  }

  const identity = {
    namespace: params.namespace,
    environment: params.environment ?? staged.preflight.environment,
    sourceType: "cursor_csv" as const,
    sourceDigestOrQueryIdentity: staged.preflight.sourceDigestSha256,
    normalizedFilters: null,
    exportWindow,
  };

  let conflicts: string[] = [];
  let verified = false;
  let scoreCount = 0;
  let verifyMismatches: string[] = [];

  await withImportLock(
    {
      logDirectory: params.logDirectory,
      importId: params.importId,
      identity,
      traceIds: bundles.map((b) => b.traceId),
    },
    async () => {
      const applyingLifecycle: ImportLifecycleState = "applying";
      await writeStagingArtifacts(params.logDirectory, params.importId, {
        ...staged,
        preflight: { ...staged.preflight, lifecycle: applyingLifecycle },
        publicSummary: {
          ...staged.publicSummary,
          lifecycle: applyingLifecycle,
        },
        ledger: {
          ...staged.ledger,
          lifecycle: applyingLifecycle,
          recordedAt: new Date().toISOString(),
        },
      });

      const resolveConfig = params.deps?.resolveConfig ?? resolveEvaluationConfig;
      const resolved = params.langfuseConfig
        ? { ok: true as const, config: params.langfuseConfig }
        : resolveConfig(process.env);
      if (!resolved.ok) throw new Error("langfuse_runtime_unavailable");
      const config = resolved.config;

      const createScore =
        params.deps?.createScoreClient ?? createScoreOnlyClient;
      const scoreClient = await createScore(config);
      if (!scoreClient) throw new Error("langfuse_score_client_unavailable");

      const allScores = built.attachments.flatMap((a) => a.scores);
      scoreCount = allScores.length;

      const traceIds = built.attachments.map((a) => a.join.traceId);
      const rawExisting = await fetchTraceScoresRawForImport(client, traceIds);
      conflicts = detectExistingScoreConflicts(
        built.attachments,
        mapFetchedScores(rawExisting.scores),
      );
      if (conflicts.length > 0) {
        throw new Error(conflicts[0]);
      }

      projectUsageScoresOnly({ recorder: scoreClient, scores: allScores });
      await scoreClient.flush();

      const verifyingLifecycle: ImportLifecycleState = "verifying";
      await writeStagingArtifacts(params.logDirectory, params.importId, {
        ...staged,
        preflight: { ...staged.preflight, lifecycle: verifyingLifecycle },
        publicSummary: {
          ...staged.publicSummary,
          lifecycle: verifyingLifecycle,
        },
        ledger: {
          ...staged.ledger,
          lifecycle: verifyingLifecycle,
          scoreCount,
          recordedAt: new Date().toISOString(),
        },
      });

      const sleep =
        params.deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
      // Live Langfuse score list lag can exceed 30s after ingestion.batch.
      const budgetMs = params.deps?.sleep ? 0 : 60_000;
      const started = Date.now();
      let verify = verifyImportedScores({
        attachments: built.attachments,
        fetchedScores: [],
        retrievalCompletenessProven: false,
      });
      for (;;) {
        const rawAfter = await fetchTraceScoresRawForImport(client, traceIds);
        const mapped = mapFetchedScores(rawAfter.scores);
        verify = verifyImportedScores({
          attachments: built.attachments,
          fetchedScores: mapped,
          retrievalCompletenessProven: rawAfter.retrievalCompletenessProven,
        });
        if (verify.verified) {
          break;
        }
        if (Date.now() - started >= budgetMs) {
          break;
        }
        await sleep(2_000);
      }
      verified = verify.verified && conflicts.length === 0;
      verifyMismatches = verify.mismatches;

      const finalLifecycle: ImportLifecycleState = verified
        ? "verified"
        : "failed_recoverable";

      await writeStagingArtifacts(params.logDirectory, params.importId, {
        canonicalEvents: events,
        preflight: {
          ...staged.preflight,
          lifecycle: finalLifecycle,
          sourceScopeComplete: true,
        },
        publicSummary: {
          ...staged.publicSummary,
          lifecycle: finalLifecycle,
          sourceScopeComplete: true,
          bundleCount: bundles.length,
        },
        ledger: {
          schemaVersion: 1,
          importId: params.importId,
          recordedAt: new Date().toISOString(),
          lifecycle: finalLifecycle,
          namespace: params.namespace,
          sourceDigestSha256: staged.preflight.sourceDigestSha256,
          exportWindow,
          bundleCount: bundles.length,
          scoreCount,
          verified,
          sourceScopeComplete: true,
        },
      });
    },
  );

  return {
    lifecycle: verified ? "verified" : "failed_recoverable",
    verified,
    scoreCount,
    conflicts,
    verifyMismatches,
  };
}

export async function getImportStatus(
  logDirectory: string,
  importId: string,
): Promise<ImportStatus | null> {
  const staged = await readStagingArtifacts(logDirectory, importId);
  if (!staged) return null;
  return {
    importId,
    lifecycle: staged.ledger.lifecycle,
    fingerprint: staged.preflight.fingerprint,
    sourceScopeComplete: staged.ledger.sourceScopeComplete,
    bundleCount: staged.ledger.bundleCount,
    verified: staged.ledger.verified,
    publicSummary: staged.publicSummary,
  };
}

export async function getAnalyticsFromLedgers(
  logDirectory: string,
): Promise<ImportAnalytics> {
  const ledgers = await listLedgers(logDirectory);
  const byNamespace: Record<string, { imports: number; bundles: number }> = {};
  let verifiedCount = 0;
  let totalBundles = 0;
  let totalScores = 0;

  for (const ledger of ledgers) {
    const ns = ledger.namespace;
    byNamespace[ns] ??= { imports: 0, bundles: 0 };
    byNamespace[ns]!.imports += 1;
    byNamespace[ns]!.bundles += ledger.bundleCount;
    totalBundles += ledger.bundleCount;
    totalScores += ledger.scoreCount;
    if (ledger.verified) verifiedCount += 1;
  }

  return {
    ledgerCount: ledgers.length,
    verifiedCount,
    totalBundles,
    totalScores,
    byNamespace,
  };
}

export { deriveScoreId, publicAgentHash as hashCloudAgentIdForPublicSummary };
