import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CanonicalUsageEvent, ExportWindow } from "./canonical.js";
import {
  CANONICAL_USAGE_SCHEMA_VERSION,
  SCORE_CONTRACT_VERSION,
} from "./canonical.js";
import { PARSER_SCHEMA_VERSION, type ParserRowEvidence } from "./parse.js";
import { MODEL_ALIAS_REGISTRY_VERSION } from "./model-aliases.js";
import { MODEL_RECONCILIATION_CONTRACT_VERSION } from "./model-reconciliation.js";
import { CURSOR_USAGE_IMPORTER_VERSION } from "./types.js";
import { PRICING_REGISTRY_VERSION } from "../telemetry/pricing-registry.js";
import type { ExpectedScoreManifest } from "./expected-score-manifest.js";
import { digestCanonical } from "./expected-score-manifest.js";
import { DEFAULT_SOURCE_COVERAGE_SAFETY_MARGIN_MS } from "./source-scope.js";

export type ImportLifecycleState =
  | "uploaded"
  | "parsed"
  | "preflighted"
  | "ready"
  | "applying"
  | "verifying"
  | "verified"
  | "incomplete"
  | "failed_recoverable";

export interface CanonicalImportIdentity {
  namespace: string;
  environment: string | null;
  sourceDigestSha256: string;
  exportWindow: ExportWindow | null;
  sourceCoverageSafetyMarginMs: number;
  normalizedSourceExclusionSet: string[];
  importerVersion: string;
  scoreContractVersion: string;
  parserSchemaVersion: number;
  canonicalUsageSchemaVersion: number;
  modelAliasRegistryVersion: string;
  modelReconciliationContractVersion: string;
  pricingRegistryVersion: string;
}

export interface ParserEvidenceArtifact {
  schemaVersion: 1;
  parserSchemaVersion: typeof PARSER_SCHEMA_VERSION;
  rows: ParserRowEvidence[];
  canonicalEventDigest: string;
  rowsTested: number;
  rowsSatisfying: number;
  rowsViolating: number;
  agentScopedRejectionCount: number;
  uploadScopedRejectionCount: number;
  rejectionReasonCodes: string[];
}

export interface PreflightPrivateArtifact {
  schemaVersion: 1;
  importId: string;
  preparedAt: string;
  importerVersion: typeof CURSOR_USAGE_IMPORTER_VERSION;
  namespace: string;
  environment: string | null;
  sourceDigestSha256: string;
  exportWindow: ExportWindow | null;
  /** @deprecated Prefer canonicalImportIdentity + preflightApprovalFingerprint */
  fingerprint: string;
  canonicalImportIdentity: string;
  preflightApprovalFingerprint: string;
  lifecycle: ImportLifecycleState;
  candidateCount: number;
  bundleCount: number;
  sourceScopeComplete: boolean;
  sourceScopeIncompleteReason: string | null;
  canonicalEventCount: number;
  sourceCoverageSafetyMarginMs: number;
  normalizedSourceExclusionSet: string[];
  uploadScopedRejectionCount: number;
  agentScopedRejectionCount: number;
  rejectionReasonCodes: string[];
  discoverySnapshotDigest: string;
  targetTraceSetDigest: string;
  expectedScoreManifestDigest: string;
}

export interface PublicSummaryArtifact {
  schemaVersion: 1;
  kind: "cursor_usage_import_staging_public";
  importId: string;
  preparedAt: string;
  importerVersion: typeof CURSOR_USAGE_IMPORTER_VERSION;
  lifecycle: ImportLifecycleState;
  namespace: string;
  sourceDigestPrefix: string;
  bundleCount: number;
  sourceScopeComplete: boolean;
  sourceScopeIncompleteReason: string | null;
  uploadScopedRejectionCount: number;
  agentScopedRejectionCount: number;
  rejectionReasonCodes: string[];
  observationMutationAttempted: false;
}

export interface ImportLedgerEntry {
  schemaVersion: 1;
  importId: string;
  recordedAt: string;
  lifecycle: ImportLifecycleState;
  namespace: string;
  sourceDigestSha256: string;
  exportWindow: ExportWindow | null;
  bundleCount: number;
  scoreCount: number;
  verified: boolean;
  sourceScopeComplete: boolean;
  sourceScopeIncompleteReason?: string | null;
  uploadScopedRejectionCount?: number;
  agentScopedRejectionCount?: number;
  rejectionReasonCodes?: string[];
  localEvidenceCompleteness?: "complete" | "partial" | "none";
  langfuseReconciliationStatus?:
    | "not_run"
    | "unavailable"
    | "complete"
    | "divergent";
  analyticsSummary?: LedgerAnalyticsSummary;
}

export interface LedgerAnalyticsSummary {
  byIssue: Record<string, { bundles: number; inputTokens: number; outputTokens: number }>;
  byPhase: Record<string, { bundles: number; inputTokens: number; outputTokens: number }>;
  bySourceModel: Record<string, { bundles: number; inputTokens: number }>;
  byCanonicalModel: Record<string, { bundles: number; inputTokens: number }>;
  byEffectiveVariant: Record<string, { bundles: number; inputTokens: number }>;
  unresolvedSegmentCount: number;
  pricingIncompleteSegmentCount: number;
}

export interface StagingArtifacts {
  canonicalEvents: CanonicalUsageEvent[];
  preflight: PreflightPrivateArtifact;
  publicSummary: PublicSummaryArtifact;
  ledger: ImportLedgerEntry;
  parserEvidence?: ParserEvidenceArtifact;
  expectedScoreManifest?: ExpectedScoreManifest;
}

const STAGING_SUBDIR = "evaluation-reports/cursor-usage-imports";
const VERIFIED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ABANDONED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function createImportId(): string {
  return randomUUID();
}

export function stagingDir(logDirectory: string, importId: string): string {
  return path.join(logDirectory, STAGING_SUBDIR, importId);
}

async function atomicWriteJson(
  targetPath: string,
  payload: unknown,
  mode?: number,
): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(tempPath, body, {
    encoding: "utf8",
    ...(mode != null ? { mode } : {}),
  });
  await rename(tempPath, targetPath);
}

export async function writeStagingArtifacts(
  logDirectory: string,
  importId: string,
  artifacts: StagingArtifacts,
): Promise<void> {
  const dir = stagingDir(logDirectory, importId);
  await mkdir(dir, { recursive: true });
  await atomicWriteJson(
    path.join(dir, "canonical-events.private.json"),
    artifacts.canonicalEvents,
    0o600,
  );
  await atomicWriteJson(
    path.join(dir, "preflight.private.json"),
    artifacts.preflight,
    0o600,
  );
  await atomicWriteJson(
    path.join(dir, "public-summary.json"),
    artifacts.publicSummary,
  );
  await atomicWriteJson(path.join(dir, "ledger.json"), artifacts.ledger);
  if (artifacts.parserEvidence) {
    await atomicWriteJson(
      path.join(dir, "parser-evidence.private.json"),
      artifacts.parserEvidence,
      0o600,
    );
  }
  if (artifacts.expectedScoreManifest) {
    await atomicWriteJson(
      path.join(dir, "expected-score-manifest.private.json"),
      artifacts.expectedScoreManifest,
      0o600,
    );
  }
}

export async function readStagingArtifacts(
  logDirectory: string,
  importId: string,
): Promise<StagingArtifacts | null> {
  const dir = stagingDir(logDirectory, importId);
  try {
    const [canonicalRaw, preflightRaw, publicRaw, ledgerRaw] = await Promise.all([
      readFile(path.join(dir, "canonical-events.private.json"), "utf8"),
      readFile(path.join(dir, "preflight.private.json"), "utf8"),
      readFile(path.join(dir, "public-summary.json"), "utf8"),
      readFile(path.join(dir, "ledger.json"), "utf8"),
    ]);
    let parserEvidence: ParserEvidenceArtifact | undefined;
    let expectedScoreManifest: ExpectedScoreManifest | undefined;
    try {
      parserEvidence = JSON.parse(
        await readFile(path.join(dir, "parser-evidence.private.json"), "utf8"),
      ) as ParserEvidenceArtifact;
    } catch {
      parserEvidence = undefined;
    }
    try {
      expectedScoreManifest = JSON.parse(
        await readFile(
          path.join(dir, "expected-score-manifest.private.json"),
          "utf8",
        ),
      ) as ExpectedScoreManifest;
    } catch {
      expectedScoreManifest = undefined;
    }
    return {
      canonicalEvents: JSON.parse(canonicalRaw) as CanonicalUsageEvent[],
      preflight: JSON.parse(preflightRaw) as PreflightPrivateArtifact,
      publicSummary: JSON.parse(publicRaw) as PublicSummaryArtifact,
      ledger: JSON.parse(ledgerRaw) as ImportLedgerEntry,
      parserEvidence,
      expectedScoreManifest,
    };
  } catch {
    return null;
  }
}

export async function listLedgers(
  logDirectory: string,
): Promise<ImportLedgerEntry[]> {
  const root = path.join(logDirectory, STAGING_SUBDIR);
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const ledgers: ImportLedgerEntry[] = [];
  for (const entry of entries) {
    if (entry === "locks") continue;
    const ledgerPath = path.join(root, entry, "ledger.json");
    try {
      const raw = await readFile(ledgerPath, "utf8");
      ledgers.push(JSON.parse(raw) as ImportLedgerEntry);
    } catch {
      // skip incomplete staging dirs
    }
  }
  return ledgers.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

/**
 * Remove expired imports. Verified entries expire after 30d; abandoned/failed after 7d.
 * Never deletes recoverable partial staging before retention elapses.
 */
export async function cleanupExpiredImports(
  logDirectory: string,
  nowMs: number = Date.now(),
): Promise<string[]> {
  const root = path.join(logDirectory, STAGING_SUBDIR);
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (entry === "locks") continue;
    const dir = path.join(root, entry);
    let dirStat;
    try {
      dirStat = await stat(dir);
    } catch {
      continue;
    }
    if (!dirStat.isDirectory()) continue;

    let ledger: ImportLedgerEntry | null = null;
    try {
      const raw = await readFile(path.join(dir, "ledger.json"), "utf8");
      ledger = JSON.parse(raw) as ImportLedgerEntry;
    } catch {
      ledger = null;
    }

    const recordedMs = ledger?.recordedAt
      ? Date.parse(ledger.recordedAt)
      : dirStat.mtimeMs;
    const ageMs = nowMs - (Number.isFinite(recordedMs) ? recordedMs : dirStat.mtimeMs);

    if (ledger?.lifecycle === "verified") {
      if (ageMs >= VERIFIED_RETENTION_MS) {
        await rm(dir, { recursive: true, force: true });
        removed.push(entry);
      }
      continue;
    }

    if (ageMs >= ABANDONED_RETENTION_MS) {
      await rm(dir, { recursive: true, force: true });
      removed.push(entry);
    }
  }

  return removed;
}

export function buildCanonicalImportIdentity(params: {
  namespace: string;
  environment?: string | null;
  sourceDigestSha256: string;
  exportWindow: ExportWindow | null;
  sourceCoverageSafetyMarginMs?: number;
  normalizedSourceExclusionSet?: string[];
}): CanonicalImportIdentity {
  return {
    namespace: params.namespace,
    environment: params.environment?.trim() || null,
    sourceDigestSha256: params.sourceDigestSha256,
    exportWindow: params.exportWindow,
    sourceCoverageSafetyMarginMs:
      params.sourceCoverageSafetyMarginMs ?? DEFAULT_SOURCE_COVERAGE_SAFETY_MARGIN_MS,
    normalizedSourceExclusionSet: params.normalizedSourceExclusionSet ?? [],
    importerVersion: CURSOR_USAGE_IMPORTER_VERSION,
    scoreContractVersion: SCORE_CONTRACT_VERSION,
    parserSchemaVersion: PARSER_SCHEMA_VERSION,
    canonicalUsageSchemaVersion: CANONICAL_USAGE_SCHEMA_VERSION,
    modelAliasRegistryVersion: MODEL_ALIAS_REGISTRY_VERSION,
    modelReconciliationContractVersion: MODEL_RECONCILIATION_CONTRACT_VERSION,
    pricingRegistryVersion: PRICING_REGISTRY_VERSION,
  };
}

export function fingerprintCanonicalImportIdentity(
  identity: CanonicalImportIdentity,
): string {
  return digestCanonical(identity);
}

export function fingerprintPreflightApproval(params: {
  canonicalImportIdentity: string;
  discoverySnapshotDigest: string;
  targetTraceSetDigest: string;
  expectedScoreManifestDigest: string;
}): string {
  return digestCanonical({
    canonicalImportIdentity: params.canonicalImportIdentity,
    discoverySnapshotDigest: params.discoverySnapshotDigest,
    targetTraceSetDigest: params.targetTraceSetDigest,
    expectedScoreManifestDigest: params.expectedScoreManifestDigest,
  });
}

/**
 * Legacy helper retained for callers; now fingerprints the full import identity.
 */
export function fingerprintStaging(params: {
  namespace: string;
  sourceDigestSha256: string;
  exportWindow: ExportWindow | null;
  environment?: string | null;
  sourceCoverageSafetyMarginMs?: number;
}): string {
  return fingerprintCanonicalImportIdentity(
    buildCanonicalImportIdentity(params),
  );
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
