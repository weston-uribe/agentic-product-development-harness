import { describe, expect, it, vi } from "vitest";
import {
  adaptObservationV2ToCandidateInput,
  buildObservationEligibilityWindow,
  discoverUsageCandidates,
  filterObservationsByEligibility,
  listWindowObservationsV2,
  observationStartInEligibilityWindow,
} from "../../src/evaluation/cursor-usage-import/discovery.js";
import {
  CURSOR_USAGE_DISCOVERY_ALGORITHM_VERSION,
  CURSOR_USAGE_OBSERVATION_ELIGIBILITY_CONTRACT,
  CURSOR_USAGE_OBSERVATION_V2_FIELDS,
} from "../../src/evaluation/cursor-usage-import/discovery-constants.js";
import type { LangfuseApiClient } from "../../src/evaluation/langfuse-inspect/client.js";
import {
  acquireDiscoveryLock,
  DiscoveryAlreadyRunningError,
} from "../../src/evaluation/cursor-usage-import/discovery-operation-lock.js";
import {
  beginPreflightCommit,
  createPreflightOperation,
  requestPreflightCancel,
  resetPreflightOperationsForTests,
  takePreflightCsvBytes,
} from "../../src/evaluation/cursor-usage-import/preflight-operation-registry.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fingerprintPreflightApproval } from "../../src/evaluation/cursor-usage-import/staging.js";

function fakeClient(handlers: {
  listTraces?: () => Promise<unknown>;
  getManyObs?: (params: Record<string, unknown>) => Promise<unknown>;
}): LangfuseApiClient {
  return {
    api: {
      sessions: { get: async () => null },
      trace: {
        list: async () =>
          handlers.listTraces
            ? handlers.listTraces()
            : { data: [], meta: { page: 1, totalPages: 1 } },
        get: async () => null,
      },
      observations: {
        getMany: async (params?: Record<string, unknown>) =>
          handlers.getManyObs
            ? handlers.getManyObs(params ?? {})
            : { data: [], meta: {} },
      },
    },
  };
}

describe("cursor usage discovery v2", () => {
  it("maps providedModelName into candidate model input", () => {
    const adapted = adaptObservationV2ToCandidateInput({
      id: "o1",
      providedModelName: "claude-4-sonnet",
      model: "ignored-legacy",
      startTime: "2026-07-19T12:00:00.000Z",
    });
    expect(adapted.model).toBe("claude-4-sonnet");
  });

  it("uses half-open eligibility interval", () => {
    const window = buildObservationEligibilityWindow({
      exportStartIso: "2026-07-19T12:00:00.000Z",
      exportEndIso: "2026-07-19T13:00:00.000Z",
      sourceCoverageSafetyMarginMs: 0,
    });
    expect(window.contract).toBe(CURSOR_USAGE_OBSERVATION_ELIGIBILITY_CONTRACT);
    expect(
      observationStartInEligibilityWindow(window.fromStartTime, window),
    ).toBe(true);
    expect(
      observationStartInEligibilityWindow(window.toStartTime, window),
    ).toBe(false);
  });

  it("includes a zero-width export instant in the eligibility interval", () => {
    const window = buildObservationEligibilityWindow({
      exportStartIso: "2026-07-19T12:00:00.000Z",
      exportEndIso: "2026-07-19T12:00:00.000Z",
      sourceCoverageSafetyMarginMs: 0,
    });
    expect(
      observationStartInEligibilityWindow("2026-07-19T12:00:00.000Z", window),
    ).toBe(true);
    expect(window.toStartTime > window.fromStartTime).toBe(true);
  });

  it("paginates observations with sequential cursor and exact filter repeat", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = fakeClient({
      getManyObs: async (params) => {
        calls.push({ ...params });
        if (!params.cursor) {
          return {
            data: [
              {
                id: "o1",
                traceId: "t1",
                startTime: "2026-07-19T12:10:00.000Z",
                providedModelName: "m1",
                metadata: { cursorAgentId: "agent-a" },
              },
            ],
            meta: { cursor: "c2" },
          };
        }
        return {
          data: [
            {
              id: "o2",
              traceId: "t1",
              startTime: "2026-07-19T12:20:00.000Z",
              providedModelName: "m1",
              metadata: { cursorAgentId: "agent-a" },
            },
          ],
          meta: {},
        };
      },
    });
    const eligibility = buildObservationEligibilityWindow({
      exportStartIso: "2026-07-19T12:00:00.000Z",
      exportEndIso: "2026-07-19T13:00:00.000Z",
      sourceCoverageSafetyMarginMs: 0,
    });
    const listed = await listWindowObservationsV2({
      client,
      eligibility,
      counters: {
        discoveryInvocationId: "test",
        traceListRequestCount: 0,
        observationRequestCount: 0,
        perTraceObservationRequestCount: 0,
      },
    });
    expect(listed.observations).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      fromStartTime: eligibility.fromStartTime,
      toStartTime: eligibility.toStartTime,
      fields: CURSOR_USAGE_OBSERVATION_V2_FIELDS,
      parseIoAsJson: false,
    });
    expect(calls[0]).not.toHaveProperty("cursor");
    expect(calls[0]).not.toHaveProperty("page");
    expect(calls[0]).not.toHaveProperty("totalPages");
    expect(calls[1].cursor).toBe("c2");
    expect(calls[1].fromStartTime).toBe(calls[0].fromStartTime);
    expect(calls[1].toStartTime).toBe(calls[0].toStartTime);
    expect(calls[1].fields).toBe(calls[0].fields);
    expect(calls[1].limit).toBe(calls[0].limit);
  });

  it("production discovery never issues per-trace observation lists", async () => {
    let perTrace = 0;
    const client = fakeClient({
      listTraces: async () => ({
        data: [
          {
            id: "t1",
            sessionId: "s1",
            timestamp: "2026-07-19T12:00:00.000Z",
            metadata: { phase: "planning", linearIssueKey: "WES-1" },
            scores: [],
          },
        ],
        meta: { page: 1, totalPages: 1 },
      }),
      getManyObs: async (params) => {
        if (params.traceId) perTrace += 1;
        return {
          data: [
            {
              id: "o1",
              traceId: "t1",
              startTime: "2026-07-19T12:05:00.000Z",
              endTime: "2026-07-19T12:06:00.000Z",
              providedModelName: "claude-4-sonnet",
              metadata: { cursorAgentId: "bc-agent-1" },
            },
          ],
          meta: {},
        };
      },
    });
    const result = await discoverUsageCandidates({
      client,
      namespace: "weston-dogfood",
      environment: "dogfood",
      fromTimestamp: "2026-07-19T12:00:00.000Z",
      toTimestamp: "2026-07-19T13:00:00.000Z",
    });
    expect(perTrace).toBe(0);
    expect(result.requestCounters.perTraceObservationRequestCount).toBe(0);
    expect(result.algorithmVersion).toBe(CURSOR_USAGE_DISCOVERY_ALGORITHM_VERSION);
    expect(result.deterministicEvidence.observationEligibilityContract).toBe(
      CURSOR_USAGE_OBSERVATION_ELIGIBILITY_CONTRACT,
    );
    expect(result.retrievalComplete).toBe(true);
  });

  it("oracle eligibility filter matches production interval for candidate compare", () => {
    const eligibility = buildObservationEligibilityWindow({
      exportStartIso: "2026-07-19T12:00:00.000Z",
      exportEndIso: "2026-07-19T13:00:00.000Z",
      sourceCoverageSafetyMarginMs: 0,
    });
    const all = [
      { id: "in", startTime: "2026-07-19T12:30:00.000Z" },
      { id: "out", startTime: "2026-07-19T13:00:00.000Z" },
      { id: "before", startTime: "2026-07-19T11:59:59.999Z" },
    ];
    const filtered = filterObservationsByEligibility(all, eligibility);
    expect(filtered.map((o) => o.id)).toEqual(["in"]);
  });

  it("fails closed on divergent observation duplicates", async () => {
    const client = fakeClient({
      listTraces: async () => ({
        data: [
          {
            id: "t1",
            sessionId: "s1",
            timestamp: "2026-07-19T12:00:00.000Z",
            metadata: {},
            scores: [],
          },
        ],
        meta: { page: 1, totalPages: 1 },
      }),
      getManyObs: async () => ({
        data: [
          {
            id: "dup",
            traceId: "t1",
            startTime: "2026-07-19T12:05:00.000Z",
            providedModelName: "m1",
            metadata: { cursorAgentId: "a1" },
          },
          {
            id: "dup",
            traceId: "t1",
            startTime: "2026-07-19T12:05:00.000Z",
            providedModelName: "m2",
            metadata: { cursorAgentId: "a1" },
          },
        ],
        meta: {},
      }),
    });
    const result = await discoverUsageCandidates({
      client,
      namespace: "ns",
      fromTimestamp: "2026-07-19T12:00:00.000Z",
      toTimestamp: "2026-07-19T13:00:00.000Z",
    });
    expect(result.retrievalComplete).toBe(false);
    expect(result.truncationReason).toBe("observation_duplicate_divergent");
  });

  it("excludes operational diagnostics from approval fingerprint inputs", () => {
    const base = {
      canonicalImportIdentity: "id",
      discoverySnapshotDigest: "snap",
      targetTraceSetDigest: "tgt",
      expectedScoreManifestDigest: "man",
      attributionSnapshotDigest: "attr",
    };
    const a = fingerprintPreflightApproval(base);
    const b = fingerprintPreflightApproval({
      ...base,
      ...({
        operationId: "op-1",
        elapsedMs: 99999,
      } as typeof base),
    });
    expect(a).toBe(b);
  });
});

describe("process_local_single_flight", () => {
  it("blocks a second lock for a different window on the same target", async () => {
    const logDirectory = mkdtempSync(path.join(tmpdir(), "cursor-lock-"));
    const identity = {
      workspaceIdentity: logDirectory,
      langfuseProjectScopeDigest: "scope",
      canonicalEndpointIdentity: "https://example.test",
      namespace: "ns",
      environmentFilter: "env",
    };
    const first = await acquireDiscoveryLock({
      identity,
      logDirectory,
      activeWindow: {
        observationFromStartTime: "2026-07-19T12:00:00.000Z",
        observationToStartTime: "2026-07-19T13:00:00.000Z",
      },
    });
    await expect(
      acquireDiscoveryLock({
        identity,
        logDirectory,
        activeWindow: {
          observationFromStartTime: "2026-07-20T12:00:00.000Z",
          observationToStartTime: "2026-07-20T13:00:00.000Z",
        },
      }),
    ).rejects.toBeInstanceOf(DiscoveryAlreadyRunningError);
    await first.release();
  });
});

describe("preflight operation registry atomicity", () => {
  it("rejects cancel after commit begins and releases CSV bytes on take/terminal", () => {
    resetPreflightOperationsForTests();
    const { operationId } = createPreflightOperation({
      workspaceIdentity: "/tmp/ws",
      csvBytes: Buffer.from("a,b\n1,2\n"),
    });
    const bytes = takePreflightCsvBytes(operationId);
    expect(bytes?.length).toBeGreaterThan(0);
    expect(takePreflightCsvBytes(operationId)).toBeNull();
    expect(beginPreflightCommit(operationId)).toBe(true);
    const cancel = requestPreflightCancel(operationId, "/tmp/ws");
    expect(cancel).toEqual({
      ok: false,
      code: "cursor_usage_preflight_cancel_too_late",
    });
  });
});
