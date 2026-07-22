import type { EvaluationRuntimeConfig } from "../types.js";
import { resolveEvaluationConfig } from "../runtime.js";
import {
  createLangfuseApiClient,
  fetchTraceScoresRawForImport,
  type LangfuseApiClient,
} from "../langfuse-inspect/client.js";
import { deriveScoreId } from "../identifiers.js";
import {
  hashCloudAgentId,
  PARSER_SCHEMA_VERSION,
  recomputeArithmeticFromEvidence,
  type ParserRowEvidence,
} from "./parse.js";
import { parseCsvSource } from "./sources/csv.js";
import { discoverUsageCandidates, type UsageCandidate } from "./discovery.js";
import {
  attributeSegmentsToCandidates,
  buildSegmentsFromCanonicalEvents,
  bundleAttributedSegments,
} from "./attribution.js";
import {
  buildCanonicalImportIdentity,
  createImportId,
  fingerprintCanonicalImportIdentity,
  fingerprintPreflightApproval,
  readStagingArtifacts,
  writeStagingArtifacts,
  listLedgers,
  type ImportLedgerEntry,
  type ImportLifecycleState,
  type ParserEvidenceArtifact,
  type StagingArtifacts,
} from "./staging.js";
import { withImportLock } from "./import-lock.js";
import { computeCostProxies } from "./proxy-cost.js";
import { projectUsageScoresOnly } from "./project.js";
import { createScoreOnlyClient } from "./score-client.js";
import { buildPhaseUsageScores } from "./scores.js";
import {
  DEFAULT_SOURCE_COVERAGE_SAFETY_MARGIN_MS,
  evaluateSourceScope,
  validateExportWindow,
} from "./source-scope.js";
import { verifyImportedScores, type FetchedScore } from "./verify.js";
import { mapFetchedScores } from "./run.js";
import type { ExportWindow, UsageSegment } from "./canonical.js";
import type { PhaseImportAttachment } from "./types.js";
import { CURSOR_USAGE_IMPORTER_VERSION } from "./types.js";
import { resolveCanonicalModelId } from "./model-aliases.js";
import { tokensSumValid } from "./parse.js";
import {
  buildExpectedScoreManifest,
  discoverySnapshotDigestFromCandidates,
  type ExpectedScoreManifest,
  type SegmentPricingManifestEntry,
} from "./expected-score-manifest.js";
import { fingerprintEvents } from "./sources/csv.js";
import {
  addMicrosStrings,
  microsStringToLangfuseUsdNumber,
} from "./money.js";

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
  sourceCoverageSafetyMarginMs?: number;
  deps?: CursorUsageServiceDeps;
}

export interface ApplyCsvImportParams {
  importId: string;
  /** Must match staged preflightApprovalFingerprint (or legacy fingerprint). */
  fingerprint: string;
  /** Explicit approval fingerprint preferred over legacy fingerprint. */
  preflightApprovalFingerprint?: string;
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
  incompleteCount: number;
  totalBundles: number;
  totalScores: number;
  byNamespace: Record<string, { imports: number; bundles: number }>;
  localEvidenceCompleteness: "complete" | "partial" | "none";
  langfuseReconciliationStatus:
    | "not_run"
    | "unavailable"
    | "complete"
    | "divergent";
  grouped: {
    byIssue: Record<string, { bundles: number; inputTokens: number; outputTokens: number }>;
    byPhase: Record<string, { bundles: number; inputTokens: number; outputTokens: number }>;
    bySourceModel: Record<string, { bundles: number; inputTokens: number }>;
    byCanonicalModel: Record<string, { bundles: number; inputTokens: number }>;
    byEffectiveVariant: Record<string, { bundles: number; inputTokens: number }>;
  };
  unresolvedSegmentCount: number;
  pricingIncompleteSegmentCount: number;
}

export interface CursorUsageServiceDeps {
  createApiClient?: (
    config: EvaluationRuntimeConfig,
  ) => Promise<LangfuseApiClient>;
  createScoreClient?: typeof createScoreOnlyClient;
  resolveConfig?: typeof resolveEvaluationConfig;
  discover?: typeof discoverUsageCandidates;
  sleep?: (ms: number) => Promise<void>;
  /** Test seam: override pricing lookup used during apply revalidation. */
  computeCostProxies?: typeof computeCostProxies;
}

function publicAgentHash(cloudAgentId: string): string {
  return hashCloudAgentId(cloudAgentId);
}

function filterCandidates(
  candidates: UsageCandidate[],
  filters?: CursorUsageImportFilters,
) {
  // No operator filters this checkpoint — full CSV is source scope.
  void filters;
  return candidates;
}

function buildParserEvidenceArtifact(params: {
  rowEvidence: ParserRowEvidence[];
  eventsDigest: string;
  rowsTested: number;
  rowsSatisfying: number;
  rowsViolating: number;
  agentScopedCount: number;
  uploadScopedCount: number;
  reasonCodes: string[];
}): ParserEvidenceArtifact {
  return {
    schemaVersion: 1,
    parserSchemaVersion: PARSER_SCHEMA_VERSION,
    rows: params.rowEvidence,
    canonicalEventDigest: params.eventsDigest,
    rowsTested: params.rowsTested,
    rowsSatisfying: params.rowsSatisfying,
    rowsViolating: params.rowsViolating,
    agentScopedRejectionCount: params.agentScopedCount,
    uploadScopedRejectionCount: params.uploadScopedCount,
    rejectionReasonCodes: params.reasonCodes,
  };
}

function agentHasRejectionOrAmbiguity(params: {
  cloudAgentIdHash: string;
  skipped: Array<{ reason: string; cloudAgentIdHash?: string }>;
  attributed: ReturnType<typeof attributeSegmentsToCandidates>;
  parserEvidence: ParserRowEvidence[];
}): boolean {
  if (
    params.skipped.some(
      (s) =>
        s.cloudAgentIdHash === params.cloudAgentIdHash &&
        (s.reason.includes("ambiguous") ||
          s.reason.includes("rejected") ||
          s.reason.includes("conflict") ||
          s.reason.includes("unmatched") ||
          s.reason.includes("no_candidate")),
    )
  ) {
    return true;
  }
  if (
    params.attributed.some(
      (a) =>
        a.segment.cloudAgentIdHash === params.cloudAgentIdHash &&
        a.state !== "matched" &&
        a.state !== "aggregate_only",
    )
  ) {
    return true;
  }
  return params.parserEvidence.some(
    (r) =>
      r.cloudAgentIdHash === params.cloudAgentIdHash &&
      r.rejectionClass === "agent_scoped_rejection",
  );
}

interface BuiltAttachments {
  attachments: PhaseImportAttachment[];
  sourceScopeComplete: boolean;
  sourceScopeIncompleteReason: string | null;
  expectedScoreManifest: ExpectedScoreManifest;
  pricingIncompleteSegmentCount: number;
  privateSegmentPricing: Array<{
    traceId: string;
    modelRaw: string;
    pricingManifest: SegmentPricingManifestEntry | null;
    knownNoncacheCostUsd: number | null;
  }>;
}

function buildAttachmentsFromBundles(params: {
  namespace: string;
  bundles: ReturnType<typeof bundleAttributedSegments>["bundles"];
  attributed: ReturnType<typeof attributeSegmentsToCandidates>;
  skipped: ReturnType<typeof bundleAttributedSegments>["skipped"];
  allSegments: UsageSegment[];
  exportWindow: ExportWindow | null;
  langfuseRetrievalComplete: boolean;
  tokenArithmeticComplete: boolean;
  hasUploadScopedRejection: boolean;
  parserEvidence: ParserRowEvidence[];
  sourceDigestPrefix: string;
  environment?: string;
  sourceCoverageSafetyMarginMs: number;
  candidates: UsageCandidate[];
  computeCostProxiesFn: typeof computeCostProxies;
}): BuiltAttachments {
  const attachments: PhaseImportAttachment[] = [];
  let sourceScopeIncompleteReason: string | null = null;
  let pricingIncompleteSegmentCount = 0;
  const privateSegmentPricing: BuiltAttachments["privateSegmentPricing"] = [];
  const pricingByScoreId: Record<string, SegmentPricingManifestEntry | null> =
    {};
  const issueKeyByTraceId: Record<string, string> = {};
  const phaseByTraceId: Record<string, string> = {};
  const sourceBundleFingerprintByTraceId: Record<string, string> = {};

  const exportValidation = validateExportWindow(params.exportWindow);
  if (!exportValidation.ok) {
    sourceScopeIncompleteReason = exportValidation.reason;
  }

  if (params.hasUploadScopedRejection) {
    sourceScopeIncompleteReason =
      sourceScopeIncompleteReason ?? "upload_scoped_rejection";
  }

  // Unmatched / skipped segments outside any bundle still block write-ready.
  if (params.skipped.length > 0) {
    sourceScopeIncompleteReason =
      sourceScopeIncompleteReason ??
      (params.skipped.some((s) => s.reason.includes("ambiguous"))
        ? "rejected_or_ambiguous_row_for_agent"
        : params.skipped.some((s) => s.reason.includes("conflict"))
          ? "model_identity_conflict"
          : "unaccounted_source_segment");
  }

  // Every CSV segment must be deterministically matched (exclusion set empty).
  const matchedFingerprints = new Set(
    params.bundles.flatMap((b) => b.matchedFingerprints),
  );
  for (const seg of params.allSegments) {
    for (const fp of seg.fingerprints) {
      if (!matchedFingerprints.has(fp)) {
        sourceScopeIncompleteReason =
          sourceScopeIncompleteReason ?? "unaccounted_source_segment";
      }
    }
  }

  for (const bundle of params.bundles) {
    if (!tokensSumValid(bundle.tokens)) {
      sourceScopeIncompleteReason = "token_arithmetic_incomplete";
      continue;
    }

    const hasRejected = agentHasRejectionOrAmbiguity({
      cloudAgentIdHash: publicAgentHash(bundle.join.cursorAgentId),
      skipped: params.skipped,
      attributed: params.attributed,
      parserEvidence: params.parserEvidence,
    });

    const scope = evaluateSourceScope({
      exportWindow: params.exportWindow,
      executionWindowStartIso: bundle.join.windowStart,
      executionWindowEndIso: bundle.join.windowEnd,
      agentSegments: bundle.segmentBreakdown,
      accountedSegmentFingerprints: new Set(bundle.matchedFingerprints),
      hasRejectedOrAmbiguousForAgent: hasRejected,
      hasUploadScopedRejection: params.hasUploadScopedRejection,
      langfuseRetrievalComplete: params.langfuseRetrievalComplete,
      tokenArithmeticComplete: params.tokenArithmeticComplete,
      sourceCoverageSafetyMarginMs: params.sourceCoverageSafetyMarginMs,
    });

    if (!scope.sourceScopeComplete) {
      sourceScopeIncompleteReason =
        sourceScopeIncompleteReason ?? scope.sourceScopeIncompleteReason;
    }

    // Per-segment pricing
    let allSegmentsPriced = true;
    let knownNoncacheSum = 0;
    let allInputAtListSum = 0;
    const segmentPricingEntries: SegmentPricingManifestEntry[] = [];

    for (const seg of bundle.segmentBreakdown) {
      const modelId =
        seg.modelIdCanonical ??
        resolveCanonicalModelId(seg.modelRaw) ??
        null;
      if (!modelId) {
        allSegmentsPriced = false;
        pricingIncompleteSegmentCount += 1;
        privateSegmentPricing.push({
          traceId: bundle.traceId,
          modelRaw: seg.modelRaw,
          pricingManifest: null,
          knownNoncacheCostUsd: null,
        });
        continue;
      }
      const proxies = params.computeCostProxiesFn({
        modelId,
        effectiveVariant: bundle.join.effectiveVariant,
        tokens: seg.tokens,
      });
      if (!proxies || proxies.pricingManifest.completenessResult !== "complete") {
        allSegmentsPriced = false;
        pricingIncompleteSegmentCount += 1;
        privateSegmentPricing.push({
          traceId: bundle.traceId,
          modelRaw: seg.modelRaw,
          pricingManifest: proxies?.pricingManifest ?? null,
          knownNoncacheCostUsd: proxies?.knownNoncacheCostUsd ?? null,
        });
        if (proxies) {
          knownNoncacheSum += proxies.knownNoncacheCostUsd;
          allInputAtListSum += proxies.allInputAtListRateUsd;
          segmentPricingEntries.push(proxies.pricingManifest);
        }
        continue;
      }
      knownNoncacheSum += proxies.knownNoncacheCostUsd;
      allInputAtListSum += proxies.allInputAtListRateUsd;
      segmentPricingEntries.push(proxies.pricingManifest);
      privateSegmentPricing.push({
        traceId: bundle.traceId,
        modelRaw: seg.modelRaw,
        pricingManifest: proxies.pricingManifest,
        knownNoncacheCostUsd: proxies.knownNoncacheCostUsd,
      });
    }

    // Cost totals require every segment priced AND no candidate_model_unknown
    // tokens-only attribution on the bundle (costAllowed semantics).
    const tokensOnlyModelUnknown = bundle.states.some(
      (s) => s === "matched",
    ) &&
      params.attributed.some(
        (a) =>
          a.state === "matched" &&
          a.candidate?.traceId === bundle.traceId &&
          a.reason === "no_observed_models_tokens_only",
      );
    const numericCostTotalsComplete =
      allSegmentsPriced &&
      scope.sourceScopeComplete &&
      !tokensOnlyModelUnknown;
    const providerMicros = bundle.segmentBreakdown
      .map((s) => s.providerActualUsdMicros)
      .filter((m): m is string => m != null);
    let providerActualUsd: number | null = null;
    let providerActualComplete = false;
    if (providerMicros.length > 0 && providerMicros.length === bundle.segmentBreakdown.length) {
      let sumMicros: string | null = null;
      for (const m of providerMicros) {
        if (sumMicros == null) sumMicros = m;
        else {
          const added = addMicrosStrings(sumMicros, m);
          if (!added.ok) {
            sumMicros = null;
            break;
          }
          sumMicros = added.microsString;
        }
      }
      if (sumMicros) {
        providerActualUsd = microsStringToLangfuseUsdNumber(sumMicros);
        providerActualComplete = providerActualUsd != null;
      }
    }

    const scores = buildPhaseUsageScores({
      namespace: params.namespace,
      join: bundle.join,
      tokens: bundle.tokens,
      knownNoncacheCostUsd: knownNoncacheSum,
      allInputAtListRateUsd: allInputAtListSum,
      tokenUsageComplete: scope.sourceScopeComplete,
      sourceScopeComplete: scope.sourceScopeComplete,
      listPriceEquivalentComplete: false,
      providerActualUsd,
      providerActualCostComplete: providerActualComplete,
      costProxyAvailable: allSegmentsPriced && !tokensOnlyModelUnknown,
      numericCostTotalsComplete,
      sourceDigestPrefix: params.sourceDigestPrefix,
      environment: params.environment,
    });

    const primaryPricing = segmentPricingEntries[0] ?? null;
    for (const score of scores) {
      if (
        score.name === "cursor_known_noncache_cost_usd" ||
        score.name === "cursor_all_input_at_list_rate_usd"
      ) {
        pricingByScoreId[score.id] = primaryPricing;
      }
    }

    issueKeyByTraceId[bundle.traceId] =
      params.candidates.find((c) => c.traceId === bundle.traceId)?.issueKey ??
      "";
    phaseByTraceId[bundle.traceId] = bundle.join.phase;
    sourceBundleFingerprintByTraceId[bundle.traceId] = fingerprintEvents(
      // Placeholder: use matched fingerprints digest
      [],
    );
    // Prefer deterministic bundle fingerprint from matched fps
    sourceBundleFingerprintByTraceId[bundle.traceId] = hashCloudAgentId(
      [...bundle.matchedFingerprints].sort().join("|"),
    );

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
      proxies: {
        knownNoncacheCostUsd: knownNoncacheSum,
        allInputAtListRateUsd: allInputAtListSum,
        pricingRegistryVersion:
          primaryPricing?.pricingRegistryVersion ?? "none",
        effectiveVariant: bundle.join.effectiveVariant,
      },
      scores,
    });
  }

  const discoverySnapshotDigest = discoverySnapshotDigestFromCandidates(
    params.candidates.map((c) => ({
      traceId: c.traceId,
      cursorAgentIdHash: c.cursorAgentIdHash,
      issueKey: c.issueKey,
      phase: c.phase,
      observedModelIds: c.observedModelIds ?? [],
      multiModelExecutionProven: c.multiModelExecutionProven === true,
    })),
  );

  const allScores = attachments.flatMap((a) => a.scores);
  const expectedScoreManifest = buildExpectedScoreManifest({
    scores: allScores,
    issueKeyByTraceId,
    phaseByTraceId,
    sourceBundleFingerprintByTraceId,
    pricingByScoreId,
    discoverySnapshotDigest,
  });

  const sourceScopeComplete =
    !params.hasUploadScopedRejection &&
    params.tokenArithmeticComplete &&
    params.langfuseRetrievalComplete &&
    params.skipped.length === 0 &&
    sourceScopeIncompleteReason == null &&
    attachments.length > 0 &&
    attachments.every((a) =>
      a.scores.some(
        (s) => s.name === "cursor_source_scope_complete" && s.value === true,
      ),
    );

  if (!sourceScopeComplete && sourceScopeIncompleteReason == null) {
    sourceScopeIncompleteReason = "unaccounted_source_segment";
  }

  return {
    attachments,
    sourceScopeComplete,
    sourceScopeIncompleteReason,
    expectedScoreManifest,
    pricingIncompleteSegmentCount,
    privateSegmentPricing,
  };
}

async function resolveLangfuseClient(params: {
  langfuseConfig?: EvaluationRuntimeConfig;
  deps?: CursorUsageServiceDeps;
}): Promise<LangfuseApiClient | null> {
  const resolveConfig = params.deps?.resolveConfig ?? resolveEvaluationConfig;
  const resolved = params.langfuseConfig
    ? { ok: true as const, config: params.langfuseConfig }
    : resolveConfig(process.env);
  if (!resolved.ok) return null;
  const createApi = params.deps?.createApiClient ?? createLangfuseApiClient;
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

function allowedApplyLifecycle(
  lifecycle: ImportLifecycleState,
  intent: "fresh" | "recovery" | "verify",
): boolean {
  if (intent === "verify") return lifecycle === "verified";
  if (intent === "fresh") return lifecycle === "ready";
  return (
    lifecycle === "failed_recoverable" ||
    lifecycle === "applying" ||
    lifecycle === "verifying"
  );
}

export async function preflightCsvImport(
  params: PreflightCsvImportParams,
): Promise<{
  importId: string;
  fingerprint: string;
  preflightApprovalFingerprint: string;
  canonicalImportIdentity: string;
  lifecycle: ImportLifecycleState;
  sourceScopeComplete: boolean;
  bundleCount: number;
  publicSummary: StagingArtifacts["publicSummary"];
}> {
  const importId = createImportId();
  const margin =
    params.sourceCoverageSafetyMarginMs ??
    DEFAULT_SOURCE_COVERAGE_SAFETY_MARGIN_MS;
  const { events, digestSha256, parsed } = await parseCsvSource({
    buffer: params.csvBytes,
  });

  const identity = buildCanonicalImportIdentity({
    namespace: params.namespace,
    environment: params.environment,
    sourceDigestSha256: digestSha256,
    exportWindow: params.exportWindow,
    sourceCoverageSafetyMarginMs: margin,
    normalizedSourceExclusionSet: [],
  });
  const canonicalImportIdentityFp = fingerprintCanonicalImportIdentity(identity);

  const segments = buildSegmentsFromCanonicalEvents(events);
  const hasUploadScopedRejection =
    parsed.rejectionSummary.uploadScopedCount > 0;
  const tokenArithmeticComplete =
    parsed.arithmetic.identityHolds && !hasUploadScopedRejection;

  let candidates: UsageCandidate[] = [];
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

  const computeFn = params.deps?.computeCostProxies ?? computeCostProxies;
  const built = buildAttachmentsFromBundles({
    namespace: params.namespace,
    bundles,
    attributed,
    skipped,
    allSegments: segments,
    exportWindow: params.exportWindow,
    langfuseRetrievalComplete,
    tokenArithmeticComplete,
    hasUploadScopedRejection,
    parserEvidence: parsed.rowEvidence,
    sourceDigestPrefix: digestSha256,
    environment: params.environment,
    sourceCoverageSafetyMarginMs: margin,
    candidates,
    computeCostProxiesFn: computeFn,
  });

  const approvalFp = fingerprintPreflightApproval({
    canonicalImportIdentity: canonicalImportIdentityFp,
    discoverySnapshotDigest: built.expectedScoreManifest.discoverySnapshotDigest,
    targetTraceSetDigest: built.expectedScoreManifest.targetTraceSetDigest,
    expectedScoreManifestDigest:
      built.expectedScoreManifest.expectedScoreManifestDigest,
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
    sourceScopeIncompleteReason: built.sourceScopeIncompleteReason,
    uploadScopedRejectionCount: parsed.rejectionSummary.uploadScopedCount,
    agentScopedRejectionCount: parsed.rejectionSummary.agentScopedCount,
    rejectionReasonCodes: parsed.rejectionSummary.reasonCodes,
    observationMutationAttempted: false,
  };

  const preflight: StagingArtifacts["preflight"] = {
    schemaVersion: 1,
    importId,
    preparedAt,
    importerVersion: CURSOR_USAGE_IMPORTER_VERSION,
    namespace: params.namespace,
    environment: params.environment?.trim() ?? null,
    sourceDigestSha256: digestSha256,
    exportWindow: params.exportWindow,
    fingerprint: approvalFp,
    canonicalImportIdentity: canonicalImportIdentityFp,
    preflightApprovalFingerprint: approvalFp,
    lifecycle,
    candidateCount: candidates.length,
    bundleCount: bundles.length,
    sourceScopeComplete: built.sourceScopeComplete,
    sourceScopeIncompleteReason: built.sourceScopeIncompleteReason,
    canonicalEventCount: events.length,
    sourceCoverageSafetyMarginMs: margin,
    normalizedSourceExclusionSet: [],
    uploadScopedRejectionCount: parsed.rejectionSummary.uploadScopedCount,
    agentScopedRejectionCount: parsed.rejectionSummary.agentScopedCount,
    rejectionReasonCodes: parsed.rejectionSummary.reasonCodes,
    discoverySnapshotDigest: built.expectedScoreManifest.discoverySnapshotDigest,
    targetTraceSetDigest: built.expectedScoreManifest.targetTraceSetDigest,
    expectedScoreManifestDigest:
      built.expectedScoreManifest.expectedScoreManifestDigest,
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
    sourceScopeIncompleteReason: built.sourceScopeIncompleteReason,
    uploadScopedRejectionCount: parsed.rejectionSummary.uploadScopedCount,
    agentScopedRejectionCount: parsed.rejectionSummary.agentScopedCount,
    rejectionReasonCodes: parsed.rejectionSummary.reasonCodes,
    localEvidenceCompleteness: "none",
    langfuseReconciliationStatus: "not_run",
  };

  const parserEvidence = buildParserEvidenceArtifact({
    rowEvidence: parsed.rowEvidence,
    eventsDigest: fingerprintEvents(events),
    rowsTested: parsed.arithmetic.rowsTested,
    rowsSatisfying: parsed.arithmetic.rowsSatisfying,
    rowsViolating: parsed.arithmetic.rowsViolating,
    agentScopedCount: parsed.rejectionSummary.agentScopedCount,
    uploadScopedCount: parsed.rejectionSummary.uploadScopedCount,
    reasonCodes: parsed.rejectionSummary.reasonCodes,
  });

  await writeStagingArtifacts(params.logDirectory, importId, {
    canonicalEvents: events,
    preflight,
    publicSummary,
    ledger,
    parserEvidence,
    expectedScoreManifest: built.expectedScoreManifest,
  });

  return {
    importId,
    fingerprint: approvalFp,
    preflightApprovalFingerprint: approvalFp,
    canonicalImportIdentity: canonicalImportIdentityFp,
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

  const approvalFp =
    params.preflightApprovalFingerprint ?? params.fingerprint;
  if (
    staged.preflight.preflightApprovalFingerprint !== approvalFp &&
    staged.preflight.fingerprint !== approvalFp
  ) {
    throw new Error("import_fingerprint_mismatch");
  }

  const lifecycle = staged.preflight.lifecycle;
  const isRecovery =
    lifecycle === "failed_recoverable" ||
    lifecycle === "applying" ||
    lifecycle === "verifying";
  const isFresh = lifecycle === "ready";
  const isVerifyOnly = lifecycle === "verified";

  if (isVerifyOnly) {
    return {
      lifecycle: "verified",
      verified: true,
      scoreCount: staged.ledger.scoreCount,
      conflicts: [],
      verifyMismatches: [],
    };
  }

  if (!allowedApplyLifecycle(lifecycle, isRecovery ? "recovery" : "fresh")) {
    throw new Error(`import_lifecycle_not_applicable:${lifecycle}`);
  }
  if (!isFresh && !isRecovery) {
    throw new Error(`import_lifecycle_not_applicable:${lifecycle}`);
  }

  if (!staged.parserEvidence) {
    throw new Error("parser_evidence_missing");
  }
  if (!staged.expectedScoreManifest) {
    throw new Error("expected_score_manifest_missing");
  }

  const arithmetic = recomputeArithmeticFromEvidence(staged.parserEvidence.rows);
  if (!arithmetic.identityHolds) {
    throw new Error("token_arithmetic_incomplete");
  }

  const events = staged.canonicalEvents;
  const segments = buildSegmentsFromCanonicalEvents(events);
  const exportWindow = staged.preflight.exportWindow;
  const margin = staged.preflight.sourceCoverageSafetyMarginMs;

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
  const { bundles, skipped } = bundleAttributedSegments({
    attributed,
    namespace: params.namespace,
  });

  const hasUploadScoped =
    staged.parserEvidence.uploadScopedRejectionCount > 0 ||
    staged.preflight.uploadScopedRejectionCount > 0;

  const computeFn = params.deps?.computeCostProxies ?? computeCostProxies;
  const built = buildAttachmentsFromBundles({
    namespace: params.namespace,
    bundles,
    attributed,
    skipped,
    allSegments: segments,
    exportWindow,
    langfuseRetrievalComplete: discovered.retrievalComplete,
    tokenArithmeticComplete: arithmetic.identityHolds,
    hasUploadScopedRejection: hasUploadScoped,
    parserEvidence: staged.parserEvidence.rows,
    sourceDigestPrefix: staged.preflight.sourceDigestSha256,
    environment: params.environment ?? staged.preflight.environment ?? undefined,
    sourceCoverageSafetyMarginMs: margin,
    candidates: discovered.candidates,
    computeCostProxiesFn: computeFn,
  });

  // Rebuild identity + approval fingerprints and compare.
  const identity = buildCanonicalImportIdentity({
    namespace: params.namespace,
    environment: params.environment ?? staged.preflight.environment,
    sourceDigestSha256: staged.preflight.sourceDigestSha256,
    exportWindow,
    sourceCoverageSafetyMarginMs: margin,
    normalizedSourceExclusionSet:
      staged.preflight.normalizedSourceExclusionSet ?? [],
  });
  const identityFp = fingerprintCanonicalImportIdentity(identity);
  if (identityFp !== staged.preflight.canonicalImportIdentity) {
    throw new Error("preflight_plan_changed:canonical_import_identity");
  }

  if (
    built.expectedScoreManifest.expectedScoreManifestDigest !==
      staged.expectedScoreManifest.expectedScoreManifestDigest ||
    built.expectedScoreManifest.targetTraceSetDigest !==
      staged.expectedScoreManifest.targetTraceSetDigest
  ) {
    throw new Error("preflight_plan_changed");
  }

  const rebuiltApproval = fingerprintPreflightApproval({
    canonicalImportIdentity: identityFp,
    discoverySnapshotDigest:
      built.expectedScoreManifest.discoverySnapshotDigest,
    targetTraceSetDigest: built.expectedScoreManifest.targetTraceSetDigest,
    expectedScoreManifestDigest:
      built.expectedScoreManifest.expectedScoreManifestDigest,
  });
  if (rebuiltApproval !== staged.preflight.preflightApprovalFingerprint) {
    throw new Error("preflight_plan_changed");
  }

  if (!built.sourceScopeComplete) {
    const incompleteLifecycle: ImportLifecycleState = "incomplete";
    await writeStagingArtifacts(params.logDirectory, params.importId, {
      ...staged,
      preflight: { ...staged.preflight, lifecycle: incompleteLifecycle },
      publicSummary: {
        ...staged.publicSummary,
        lifecycle: incompleteLifecycle,
        sourceScopeComplete: false,
      },
      ledger: {
        ...staged.ledger,
        lifecycle: incompleteLifecycle,
        sourceScopeComplete: false,
        recordedAt: new Date().toISOString(),
      },
    });
    throw new Error(
      `source_scope_incomplete:${built.sourceScopeIncompleteReason ?? "unknown"}`,
    );
  }

  const lockIdentity = {
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
      identity: lockIdentity,
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
        expectedScoreManifest: staged.expectedScoreManifest,
        parserEvidence: staged.parserEvidence,
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
      const existingMapped = mapFetchedScores(rawExisting.scores);

      // Recovery: same-ID/same-value reuse; same-ID/different-value blocks.
      const stagedById = new Map(
        staged.expectedScoreManifest!.scores.map((s) => [s.scoreId, s]),
      );
      for (const score of allScores) {
        const stagedEntry = stagedById.get(score.id);
        if (!stagedEntry) continue;
        if (stagedEntry.targetTraceId !== score.traceId) {
          throw new Error(`same_id_different_target:${score.id}`);
        }
        const existing = existingMapped.find((e) => e.id === score.id);
        if (existing) {
          if (
            String(existing.value) !==
            stagedEntry.canonicalValueSerialization &&
            String(existing.value) !== String(score.value)
          ) {
            throw new Error(`same_id_different_value:${score.id}`);
          }
        }
      }

      // Unexpected cursor-import scores on same traces → block if uncertain.
      const expectedIds = new Set(allScores.map((s) => s.id));
      for (const existing of existingMapped) {
        if (
          existing.id &&
          !expectedIds.has(existing.id) &&
          typeof existing.name === "string" &&
          existing.name.startsWith("cursor_")
        ) {
          conflicts.push(`unexpected_cursor_import_score:${existing.id}`);
        }
      }

      conflicts = [
        ...conflicts,
        ...detectExistingScoreConflicts(built.attachments, existingMapped),
      ];
      if (conflicts.length > 0) {
        throw new Error(conflicts[0]);
      }

      // Write only scores that are missing (recovery reuse).
      const toWrite = allScores.filter(
        (s) => !existingMapped.some((e) => e.id === s.id),
      );
      if (toWrite.length > 0) {
        projectUsageScoresOnly({ recorder: scoreClient, scores: toWrite });
        await scoreClient.flush();
      }
      scoreCount = allScores.length;

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
        expectedScoreManifest: staged.expectedScoreManifest,
        parserEvidence: staged.parserEvidence,
      });

      const sleep =
        params.deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
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
          localEvidenceCompleteness: verified ? "complete" : "partial",
          langfuseReconciliationStatus: "not_run",
        },
        parserEvidence: staged.parserEvidence,
        expectedScoreManifest: staged.expectedScoreManifest,
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
    fingerprint: staged.preflight.preflightApprovalFingerprint,
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
  let incompleteCount = 0;
  let totalBundles = 0;
  let totalScores = 0;
  let unresolvedSegmentCount = 0;
  let pricingIncompleteSegmentCount = 0;

  const grouped = {
    byIssue: {} as Record<string, { bundles: number; inputTokens: number; outputTokens: number }>,
    byPhase: {} as Record<string, { bundles: number; inputTokens: number; outputTokens: number }>,
    bySourceModel: {} as Record<string, { bundles: number; inputTokens: number }>,
    byCanonicalModel: {} as Record<string, { bundles: number; inputTokens: number }>,
    byEffectiveVariant: {} as Record<string, { bundles: number; inputTokens: number }>,
  };

  for (const ledger of ledgers) {
    const ns = ledger.namespace;
    byNamespace[ns] ??= { imports: 0, bundles: 0 };
    byNamespace[ns]!.imports += 1;
    byNamespace[ns]!.bundles += ledger.bundleCount;
    totalBundles += ledger.bundleCount;
    totalScores += ledger.scoreCount;
    if (ledger.verified) verifiedCount += 1;
    if (!ledger.sourceScopeComplete || ledger.lifecycle === "incomplete") {
      incompleteCount += 1;
    }
    if (ledger.analyticsSummary) {
      unresolvedSegmentCount += ledger.analyticsSummary.unresolvedSegmentCount;
      pricingIncompleteSegmentCount +=
        ledger.analyticsSummary.pricingIncompleteSegmentCount;
      for (const [k, v] of Object.entries(ledger.analyticsSummary.byIssue)) {
        const cur = grouped.byIssue[k] ?? {
          bundles: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
        cur.bundles += v.bundles;
        cur.inputTokens += v.inputTokens;
        cur.outputTokens += v.outputTokens;
        grouped.byIssue[k] = cur;
      }
      for (const [k, v] of Object.entries(ledger.analyticsSummary.byPhase)) {
        const cur = grouped.byPhase[k] ?? {
          bundles: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
        cur.bundles += v.bundles;
        cur.inputTokens += v.inputTokens;
        cur.outputTokens += v.outputTokens;
        grouped.byPhase[k] = cur;
      }
      for (const [k, v] of Object.entries(ledger.analyticsSummary.bySourceModel)) {
        const cur = grouped.bySourceModel[k] ?? { bundles: 0, inputTokens: 0 };
        cur.bundles += v.bundles;
        cur.inputTokens += v.inputTokens;
        grouped.bySourceModel[k] = cur;
      }
      for (const [k, v] of Object.entries(
        ledger.analyticsSummary.byCanonicalModel,
      )) {
        const cur = grouped.byCanonicalModel[k] ?? {
          bundles: 0,
          inputTokens: 0,
        };
        cur.bundles += v.bundles;
        cur.inputTokens += v.inputTokens;
        grouped.byCanonicalModel[k] = cur;
      }
      for (const [k, v] of Object.entries(
        ledger.analyticsSummary.byEffectiveVariant,
      )) {
        const cur = grouped.byEffectiveVariant[k] ?? {
          bundles: 0,
          inputTokens: 0,
        };
        cur.bundles += v.bundles;
        cur.inputTokens += v.inputTokens;
        grouped.byEffectiveVariant[k] = cur;
      }
    }
  }

  let localEvidenceCompleteness: ImportAnalytics["localEvidenceCompleteness"] =
    "none";
  if (ledgers.length === 0) localEvidenceCompleteness = "none";
  else if (verifiedCount === ledgers.length) localEvidenceCompleteness = "complete";
  else if (verifiedCount > 0 || totalScores > 0) localEvidenceCompleteness = "partial";
  else localEvidenceCompleteness = "none";

  return {
    ledgerCount: ledgers.length,
    verifiedCount,
    incompleteCount,
    totalBundles,
    totalScores,
    byNamespace,
    localEvidenceCompleteness,
    langfuseReconciliationStatus: "not_run",
    grouped,
    unresolvedSegmentCount,
    pricingIncompleteSegmentCount,
  };
}

export { deriveScoreId, publicAgentHash as hashCloudAgentIdForPublicSummary };
