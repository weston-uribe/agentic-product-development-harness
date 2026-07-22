import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CanonicalUsageEvent, ExportWindow } from "./canonical.js";
import { CURSOR_USAGE_IMPORTER_VERSION } from "./types.js";

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

export interface PreflightPrivateArtifact {
  schemaVersion: 1;
  importId: string;
  preparedAt: string;
  importerVersion: typeof CURSOR_USAGE_IMPORTER_VERSION;
  namespace: string;
  environment: string | null;
  sourceDigestSha256: string;
  exportWindow: ExportWindow | null;
  fingerprint: string;
  lifecycle: ImportLifecycleState;
  candidateCount: number;
  bundleCount: number;
  sourceScopeComplete: boolean;
  sourceScopeIncompleteReason: string | null;
  canonicalEventCount: number;
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
}

export interface StagingArtifacts {
  canonicalEvents: CanonicalUsageEvent[];
  preflight: PreflightPrivateArtifact;
  publicSummary: PublicSummaryArtifact;
  ledger: ImportLedgerEntry;
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
    return {
      canonicalEvents: JSON.parse(canonicalRaw) as CanonicalUsageEvent[],
      preflight: JSON.parse(preflightRaw) as PreflightPrivateArtifact,
      publicSummary: JSON.parse(publicRaw) as PublicSummaryArtifact,
      ledger: JSON.parse(ledgerRaw) as ImportLedgerEntry,
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

    // Abandoned, failed, incomplete, and recoverable partials: 7d minimum retention.
    if (ageMs >= ABANDONED_RETENTION_MS) {
      await rm(dir, { recursive: true, force: true });
      removed.push(entry);
    }
  }

  return removed;
}

export function fingerprintStaging(params: {
  namespace: string;
  sourceDigestSha256: string;
  exportWindow: ExportWindow | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        namespace: params.namespace,
        sourceDigestSha256: params.sourceDigestSha256,
        exportWindow: params.exportWindow,
      }),
    )
    .digest("hex");
}
