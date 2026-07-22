import { createHash } from "node:crypto";
import type { CsvCostCategory, CsvRowNormalized, TokenBuckets } from "./types.js";

export const CSV_COLUMNS = {
  date: "Date",
  cloudAgentId: "Cloud Agent ID",
  automationId: "Automation ID",
  kind: "Kind",
  model: "Model",
  maxMode: "Max Mode",
  inputWithCacheWrite: "Input (w/ Cache Write)",
  inputWithoutCacheWrite: "Input (w/o Cache Write)",
  cacheRead: "Cache Read",
  output: "Output Tokens",
  total: "Total Tokens",
  cost: "Cost",
} as const;

export const PARSER_SCHEMA_VERSION = 1 as const;

const FORMULA_PREFIX = /^=|^[+@]|^-/;

/** Minimum length for a recoverable Cloud Agent ID (matches discovery gate). */
const MIN_CLOUD_AGENT_ID_LENGTH = 8;

export type RejectionClass =
  | "agent_scoped_rejection"
  | "upload_scoped_rejection";

export interface ParserRowEvidence {
  sourceRowOrdinal: number;
  rowFingerprint: string;
  cloudAgentIdHash: string | null;
  cloudAgentId: string | null;
  inputWithCacheWrite: number | null;
  inputWithoutCacheWrite: number | null;
  cacheRead: number | null;
  output: number | null;
  total: number | null;
  parseValid: boolean;
  arithmeticHolds: boolean | null;
  rejectionClass: RejectionClass | null;
  rejectionReason: string | null;
  canonicalEventFingerprint: string | null;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isFormulaUnsafe(raw: string): boolean {
  const s = raw.trim();
  return s.length > 0 && FORMULA_PREFIX.test(s) && !/^-?\d+(\.\d+)?$/.test(s);
}

function parseToken(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  if (isFormulaUnsafe(s)) return null;
  const normalized = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Numeric Cost cells are classified as provider_cost_numeric_untyped until
 * current Cursor export documentation or a sanitized real export proves USD.
 * "Included in …" is never treated as actual $0.
 */
function classifyCost(raw: string): CsvCostCategory {
  const s = raw.trim();
  if (s === "") return "empty";
  if (isFormulaUnsafe(s)) return "other";
  if (/included/i.test(s)) return "included_like";
  if (/^\$?-?\d+(\.\d+)?$/.test(s)) return "provider_cost_numeric_untyped";
  return "other";
}

function fingerprintRow(parts: Record<string, string | number | null>): string {
  const canonical = [
    parts.timestamp,
    parts.cloudAgentId,
    parts.automationId,
    parts.model,
    parts.maxMode,
    parts.inputWithCacheWrite,
    parts.inputWithoutCacheWrite,
    parts.cacheRead,
    parts.output,
    parts.total,
    parts.costCategory,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function hashCloudAgentId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}

export function digestCsvBytes(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Recover Cloud Agent identity. Empty / too-short / formula-unsafe → unavailable.
 */
export function recoverCloudAgentId(
  raw: string,
): { ok: true; id: string } | { ok: false; reason: string } {
  const id = raw.trim();
  if (!id) return { ok: false, reason: "cloud_agent_id_missing" };
  if (isFormulaUnsafe(id)) return { ok: false, reason: "cloud_agent_id_formula_unsafe" };
  if (id.length < MIN_CLOUD_AGENT_ID_LENGTH) {
    return { ok: false, reason: "cloud_agent_id_invalid" };
  }
  return { ok: true, id };
}

/**
 * Harmless blank/trailing line: empty or whitespace-only after the header.
 * Explicit parser rule — does not create a rejection.
 */
export function isHarmlessBlankCsvLine(line: string): boolean {
  return line.trim().length === 0;
}

export interface ParseCsvResult {
  headers: string[];
  rows: CsvRowNormalized[];
  rowEvidence: ParserRowEvidence[];
  arithmetic: {
    rowsTested: number;
    rowsSatisfying: number;
    rowsViolating: number;
    identityHolds: boolean;
  };
  rejectionSummary: {
    agentScopedCount: number;
    uploadScopedCount: number;
    reasonCodes: string[];
  };
}

export function parseCursorUsageCsv(raw: string): ParseCsvResult {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    return {
      headers: [],
      rows: [],
      rowEvidence: [],
      arithmetic: {
        rowsTested: 0,
        rowsSatisfying: 0,
        rowsViolating: 0,
        identityHolds: false,
      },
      rejectionSummary: {
        agentScopedCount: 0,
        uploadScopedCount: 0,
        reasonCodes: [],
      },
    };
  }

  // Find first non-blank line as header.
  let headerLineIndex = 0;
  while (
    headerLineIndex < lines.length &&
    isHarmlessBlankCsvLine(lines[headerLineIndex]!)
  ) {
    headerLineIndex += 1;
  }
  if (headerLineIndex >= lines.length) {
    return {
      headers: [],
      rows: [],
      rowEvidence: [],
      arithmetic: {
        rowsTested: 0,
        rowsSatisfying: 0,
        rowsViolating: 0,
        identityHolds: false,
      },
      rejectionSummary: {
        agentScopedCount: 0,
        uploadScopedCount: 0,
        reasonCodes: [],
      },
    };
  }

  const headers = parseCsvLine(lines[headerLineIndex]!);
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  for (const name of Object.values(CSV_COLUMNS)) {
    if (!(name in idx)) {
      throw new Error(`Missing required CSV column: ${name}`);
    }
  }

  const rows: CsvRowNormalized[] = [];
  const rowEvidence: ParserRowEvidence[] = [];
  let rowsTested = 0;
  let rowsSatisfying = 0;
  let rowsViolating = 0;
  const reasonCodes = new Set<string>();
  let agentScopedCount = 0;
  let uploadScopedCount = 0;
  let sourceRowOrdinal = 0;

  for (let li = headerLineIndex + 1; li < lines.length; li++) {
    const line = lines[li]!;
    // Explicit rule: blank/trailing lines are not rejections.
    if (isHarmlessBlankCsvLine(line)) {
      continue;
    }

    const cells = parseCsvLine(line);
    const get = (name: string) => cells[idx[name]!] ?? "";
    const ordinal = sourceRowOrdinal;
    sourceRowOrdinal += 1;

    const tw = parseToken(get(CSV_COLUMNS.inputWithCacheWrite));
    const two = parseToken(get(CSV_COLUMNS.inputWithoutCacheWrite));
    const cr = parseToken(get(CSV_COLUMNS.cacheRead));
    const out = parseToken(get(CSV_COLUMNS.output));
    const tot = parseToken(get(CSV_COLUMNS.total));
    const agentRecovered = recoverCloudAgentId(get(CSV_COLUMNS.cloudAgentId));
    const cloudAgentId = agentRecovered.ok ? agentRecovered.id : null;
    const cloudAgentIdHash = cloudAgentId ? hashCloudAgentId(cloudAgentId) : null;

    const tokensComplete =
      tw !== null && two !== null && cr !== null && out !== null && tot !== null;
    const costCategory = classifyCost(get(CSV_COLUMNS.cost));
    const automationId = get(CSV_COLUMNS.automationId);
    const kind = get(CSV_COLUMNS.kind);
    const model = get(CSV_COLUMNS.model);
    const maxMode = get(CSV_COLUMNS.maxMode);
    const timestampIso = get(CSV_COLUMNS.date);

    const rowFingerprint = fingerprintRow({
      timestamp: timestampIso,
      cloudAgentId: cloudAgentId ?? get(CSV_COLUMNS.cloudAgentId),
      automationId,
      model,
      maxMode,
      inputWithCacheWrite: tw,
      inputWithoutCacheWrite: two,
      cacheRead: cr,
      output: out,
      total: tot,
      costCategory,
    });

    let rejectionClass: RejectionClass | null = null;
    let rejectionReason: string | null = null;
    let parseValid = true;
    let arithmeticHolds: boolean | null = null;
    let canonicalEventFingerprint: string | null = null;

    if (!agentRecovered.ok) {
      parseValid = false;
      rejectionClass = "upload_scoped_rejection";
      rejectionReason = agentRecovered.reason;
    } else if (!tokensComplete) {
      parseValid = false;
      rejectionClass = "agent_scoped_rejection";
      rejectionReason = "token_fields_parse_invalid";
    } else {
      rowsTested += 1;
      const sum = tw! + two! + cr! + out!;
      arithmeticHolds = sum === tot!;
      if (arithmeticHolds) rowsSatisfying += 1;
      else {
        rowsViolating += 1;
        rejectionClass = "agent_scoped_rejection";
        rejectionReason = "token_arithmetic_invalid";
        parseValid = false;
      }
    }

    if (rejectionClass) {
      reasonCodes.add(rejectionReason ?? "unknown");
      if (rejectionClass === "agent_scoped_rejection") agentScopedCount += 1;
      else uploadScopedCount += 1;
    }

    if (parseValid && tokensComplete && cloudAgentId && arithmeticHolds) {
      const tokens: TokenBuckets = {
        inputTokens: two!,
        cacheWriteTokens: tw!,
        cacheReadTokens: cr!,
        outputTokens: out!,
        totalTokens: tot!,
      };
      canonicalEventFingerprint = rowFingerprint;
      rows.push({
        fingerprint: rowFingerprint,
        timestampIso,
        cloudAgentId,
        automationId,
        kind,
        model,
        maxMode,
        tokens,
        costCategory,
      });
    }

    rowEvidence.push({
      sourceRowOrdinal: ordinal,
      rowFingerprint,
      cloudAgentIdHash,
      cloudAgentId,
      inputWithCacheWrite: tw,
      inputWithoutCacheWrite: two,
      cacheRead: cr,
      output: out,
      total: tot,
      parseValid,
      arithmeticHolds,
      rejectionClass,
      rejectionReason,
      canonicalEventFingerprint,
    });
  }

  return {
    headers,
    rows,
    rowEvidence,
    arithmetic: {
      rowsTested,
      rowsSatisfying,
      rowsViolating,
      identityHolds:
        rowsTested > 0 &&
        rowsViolating === 0 &&
        agentScopedCount === 0 &&
        uploadScopedCount === 0,
    },
    rejectionSummary: {
      agentScopedCount,
      uploadScopedCount,
      reasonCodes: [...reasonCodes].sort(),
    },
  };
}

export function tokensSumValid(t: TokenBuckets): boolean {
  return (
    t.totalTokens ===
    t.inputTokens + t.cacheWriteTokens + t.cacheReadTokens + t.outputTokens
  );
}

/** Recompute arithmetic from staged per-row evidence (apply path). */
export function recomputeArithmeticFromEvidence(
  evidence: ParserRowEvidence[],
): { identityHolds: boolean; rowsViolating: number; rowsTested: number } {
  let rowsTested = 0;
  let rowsViolating = 0;
  for (const row of evidence) {
    if (
      row.inputWithCacheWrite == null ||
      row.inputWithoutCacheWrite == null ||
      row.cacheRead == null ||
      row.output == null ||
      row.total == null
    ) {
      continue;
    }
    rowsTested += 1;
    const sum =
      row.inputWithCacheWrite +
      row.inputWithoutCacheWrite +
      row.cacheRead +
      row.output;
    if (sum !== row.total) rowsViolating += 1;
  }
  const hasBlockingRejection = evidence.some((r) => r.rejectionClass != null);
  return {
    rowsTested,
    rowsViolating,
    identityHolds:
      rowsTested > 0 && rowsViolating === 0 && !hasBlockingRejection,
  };
}
