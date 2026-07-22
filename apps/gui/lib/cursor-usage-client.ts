"use client";

const NONCE_HEADER = "x-p-dev-observability-nonce";

async function cursorUsageFetch(
  path: string,
  nonce: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.headers ?? {}),
      [NONCE_HEADER]: nonce,
    },
  });
}

export interface CursorUsageConfigResponse {
  namespace: string;
  environment: string | null;
  adminKeyConfigured: boolean;
}

export interface PublicPreflightRow {
  cloudAgentIdHash: string;
  state: "matched" | "conflict" | "unresolved";
  phase: string | null;
  reason: string | null;
}

export interface PreflightResponse {
  importId: string;
  fingerprint: string;
  preflightApprovalFingerprint?: string;
  lifecycle: string;
  sourceScopeComplete: boolean;
  sourceScopeIncompleteReason?: string | null;
  bundleCount: number;
  publicSummary: Record<string, unknown>;
  rows: PublicPreflightRow[];
  conflicts: string[];
  uploadScopedRejectionCount?: number;
  agentScopedRejectionCount?: number;
  rejectionReasonCodes?: string[];
}

export interface ApplyResponse {
  lifecycle: string;
  verified: boolean;
  scoreCount: number;
  conflicts: string[];
}

export interface ImportStatusResponse {
  importId: string;
  lifecycle: string;
  fingerprint: string;
  sourceScopeComplete: boolean;
  bundleCount: number;
  verified: boolean;
  publicSummary: Record<string, unknown> | null;
}

export interface AnalyticsResponse {
  ledgerCount: number;
  verifiedCount: number;
  incompleteCount?: number;
  totalBundles: number;
  totalScores: number;
  byNamespace: Record<string, { imports: number; bundles: number }>;
  localEvidenceCompleteness: "complete" | "partial" | "none";
  langfuseReconciliationStatus:
    | "not_run"
    | "unavailable"
    | "complete"
    | "divergent";
  grouped?: {
    byIssue: Record<
      string,
      {
        bundles: number;
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        cacheWriteTokens?: number;
        cacheReadTokens?: number;
      }
    >;
    byPhase: Record<
      string,
      {
        bundles: number;
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      }
    >;
    bySourceModel: Record<
      string,
      { bundles: number; inputTokens?: number; totalTokens?: number }
    >;
    byCanonicalModel: Record<
      string,
      { bundles: number; inputTokens?: number; totalTokens?: number }
    >;
    byEffectiveVariant: Record<
      string,
      { bundles: number; inputTokens?: number; totalTokens?: number }
    >;
    bySourceDigest?: Record<
      string,
      { bundles: number; inputTokens?: number; totalTokens?: number }
    >;
    byPricingRegistryVersion?: Record<
      string,
      { bundles: number; inputTokens?: number; totalTokens?: number }
    >;
  };
  unresolvedSegmentCount?: number;
  pricingIncompleteSegmentCount?: number;
}

export interface CursorUsageInspectResponse {
  sourceDigestSha256: string;
  sourceDigestPrefix: string;
  inspectionToken: string;
  sourceRowCount: number;
  validTimestampCount: number;
  invalidTimestampCount: number;
  minTimestampIso: string | null;
  maxTimestampIso: string | null;
  sortOrder: "ascending" | "descending" | "unsorted";
  timestampPrecision: string;
  timezoneEvidence: string;
  cloudAgentAttributableRowCount: number;
  nonCloudAgentExcludedRowCount: number;
  nonCloudAgentNoTokenEventCount: number;
  nonCloudAgentInvalidCount: number;
  invalidNonblankAgentIdCount: number;
  agentScopedRejectionCount: number;
  uploadScopedRejectionCount: number;
  tokenBearingRowCount: number;
  tokenArithmeticValidCount: number;
  tokenArithmeticInvalidCount: number;
  cloudAgentArithmeticComplete: boolean;
  nonCloudAggregateArithmeticComplete: boolean;
  tokenBucketNonzeroCounts: {
    inputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  tokenBucketTotals: {
    inputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  observedWindow: {
    startIso: string;
    endIso: string;
    timezone: string;
    precision: string;
    boundsSource: string;
  } | null;
  assumedTimezone: string | null;
  disambiguationPolicy: string;
}

export async function fetchCursorUsageConfig(): Promise<CursorUsageConfigResponse> {
  const response = await fetch("/api/settings/cursor-usage/config", {
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error("Could not load Cursor usage configuration.");
  }
  return (await response.json()) as CursorUsageConfigResponse;
}

export async function postCursorUsageInspect(
  formData: FormData,
  nonce: string,
): Promise<CursorUsageInspectResponse> {
  const response = await cursorUsageFetch(
    "/api/settings/cursor-usage/inspect",
    nonce,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? "Inspection failed.");
  }
  return (await response.json()) as CursorUsageInspectResponse;
}

export async function postCursorUsagePreflight(
  formData: FormData,
  nonce: string,
): Promise<PreflightResponse> {
  const response = await cursorUsageFetch(
    "/api/settings/cursor-usage/preflight",
    nonce,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? "Preflight failed.");
  }
  return (await response.json()) as PreflightResponse;
}

export async function postCursorUsageApply(
  body: {
    importId: string;
    fingerprint: string;
    preflightApprovalFingerprint?: string;
    confirmed: true;
  },
  nonce: string,
): Promise<ApplyResponse> {
  const response = await cursorUsageFetch(
    "/api/settings/cursor-usage/apply",
    nonce,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? "Apply failed.");
  }
  return (await response.json()) as ApplyResponse;
}

export async function fetchCursorUsageStatus(
  importId: string,
): Promise<ImportStatusResponse | null> {
  const response = await fetch(
    `/api/settings/cursor-usage/status?importId=${encodeURIComponent(importId)}`,
    { credentials: "same-origin" },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Could not load import status.");
  }
  return (await response.json()) as ImportStatusResponse;
}

export async function fetchCursorUsageAnalytics(): Promise<AnalyticsResponse> {
  const response = await fetch("/api/settings/cursor-usage/analytics", {
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error("Could not load Cursor usage analytics.");
  }
  return (await response.json()) as AnalyticsResponse;
}
