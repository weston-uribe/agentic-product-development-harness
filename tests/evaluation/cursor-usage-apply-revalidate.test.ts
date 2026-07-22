import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCsvImport,
  preflightCsvImport,
} from "../../src/evaluation/cursor-usage-import/service.js";
import type { UsageCandidate } from "../../src/evaluation/cursor-usage-import/discovery.js";
import {
  MULTI_MODEL_EXECUTION_PROVEN_FIELD,
} from "../../src/evaluation/cursor-usage-import/types.js";
import {
  normalizeModelRaw,
  resolveCanonicalModelId,
} from "../../src/evaluation/cursor-usage-import/model-aliases.js";
import type { EvaluationRuntimeConfig } from "../../src/evaluation/types.js";
import type { LangfuseApiClient } from "../../src/evaluation/langfuse-inspect/client.js";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/cursor-usage",
);
const sampleCsv = readFileSync(path.join(fixtureDir, "sample-usage.csv"), "utf8");

const exportWindow = {
  startIso: "2026-07-19T00:00:00.000Z",
  endIso: "2026-07-20T00:00:00.000Z",
  timezone: "UTC",
  precision: "millisecond" as const,
  boundsSource: "cli_flags" as const,
};

const langfuseConfig: EvaluationRuntimeConfig = {
  provider: "langfuse",
  captureProfile: "metadata-v1",
  publicKey: "pk",
  secretKey: "sk",
  baseUrl: "http://example.invalid",
  namespace: "default",
  tracingEnvironment: "test",
  release: null,
};

function makeCandidate(params: {
  agentId: string;
  phase: "planning" | "plan_review";
  traceId: string;
  windowStart: string;
  windowEnd: string;
}): UsageCandidate {
  const observedModels = [
    {
      rawModel: "composer-2.5",
      normalizedRawModel: normalizeModelRaw("composer-2.5"),
      canonicalModelId: resolveCanonicalModelId("composer-2.5"),
      variant: "standard" as const,
      observationIds: [`obs-${params.traceId}`],
    },
  ];
  return {
    traceId: params.traceId,
    sessionId: "a".repeat(64),
    timestamp: params.windowStart,
    cursorAgentId: params.agentId,
    cursorAgentIdHash: "hash",
    issueKey: "TT-FIXTURE",
    phase: params.phase,
    phaseExecutionId: `pe-${params.phase}`,
    harnessRunId: `hr-${params.phase}`,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    model: "composer-2.5",
    effectiveVariant: "standard",
    existingCursorScoreNames: [],
    observedModels,
    observedModelIds: ["composer-2.5"],
    multiModelExecutionProven: false,
    multiModelProofField: MULTI_MODEL_EXECUTION_PROVEN_FIELD,
  };
}

const readyDiscoverCandidates = [
  makeCandidate({
    agentId: "bc-agent-planning-001",
    phase: "planning",
    traceId: "trace-planning",
    windowStart: "2026-07-19T11:00:00.000Z",
    windowEnd: "2026-07-19T13:00:00.000Z",
  }),
  makeCandidate({
    agentId: "bc-agent-planreview-001",
    phase: "plan_review",
    traceId: "trace-plan-review",
    windowStart: "2026-07-19T12:00:00.000Z",
    windowEnd: "2026-07-19T14:00:00.000Z",
  }),
];

const serviceDeps = {
  createApiClient: async () => ({}) as LangfuseApiClient,
};

describe("cursor usage apply revalidation", () => {
  it("throws on apply when discover returns empty and never calls score client", async () => {
    const logDirectory = mkdtempSync(path.join(tmpdir(), "cursor-usage-apply-"));
    let scoreClientCalls = 0;

    const preflight = await preflightCsvImport({
      csvBytes: sampleCsv,
      exportWindow,
      namespace: "default",
      logDirectory,
      langfuseConfig,
      discoverLangfuse: true,
      deps: {
        ...serviceDeps,
        discover: async () => ({
          candidates: readyDiscoverCandidates,
          retrievalComplete: true,
        }),
      },
    });
    expect(preflight.lifecycle).toBe("ready");

    await expect(
      applyCsvImport({
        importId: preflight.importId,
        fingerprint: preflight.fingerprint,
        confirmed: true,
        logDirectory,
        namespace: "default",
        langfuseConfig,
        deps: {
          ...serviceDeps,
          discover: async () => ({
            candidates: [],
            retrievalComplete: false,
          }),
          createScoreClient: async () => {
            scoreClientCalls += 1;
            return { recordScore() {}, flush: async () => {} };
          },
        },
      }),
    ).rejects.toThrow(/preflight_plan_changed|source_scope_incomplete/);

    expect(scoreClientCalls).toBe(0);
  });

  it("throws on apply when discover retrieval is incomplete and never calls score client", async () => {
    const logDirectory = mkdtempSync(path.join(tmpdir(), "cursor-usage-apply-"));
    let scoreClientCalls = 0;

    const preflight = await preflightCsvImport({
      csvBytes: sampleCsv,
      exportWindow,
      namespace: "default",
      logDirectory,
      langfuseConfig,
      discoverLangfuse: true,
      deps: {
        ...serviceDeps,
        discover: async () => ({
          candidates: readyDiscoverCandidates,
          retrievalComplete: true,
        }),
      },
    });

    await expect(
      applyCsvImport({
        importId: preflight.importId,
        fingerprint: preflight.fingerprint,
        confirmed: true,
        logDirectory,
        namespace: "default",
        langfuseConfig,
        deps: {
          ...serviceDeps,
          discover: async () => ({
            candidates: readyDiscoverCandidates,
            retrievalComplete: false,
          }),
          createScoreClient: async () => {
            scoreClientCalls += 1;
            return { recordScore() {}, flush: async () => {} };
          },
        },
      }),
    ).rejects.toThrow(
      /preflight_plan_changed|source_scope_incomplete:langfuse_retrieval_incomplete/,
    );

    expect(scoreClientCalls).toBe(0);
  });

  it("throws import_lifecycle_not_applicable after preflighted lifecycle", async () => {
    const logDirectory = mkdtempSync(path.join(tmpdir(), "cursor-usage-apply-"));
    const preflight = await preflightCsvImport({
      csvBytes: sampleCsv,
      exportWindow,
      namespace: "default",
      logDirectory,
      discoverLangfuse: false,
    });
    expect(preflight.lifecycle).toBe("preflighted");

    await expect(
      applyCsvImport({
        importId: preflight.importId,
        fingerprint: preflight.fingerprint,
        confirmed: true,
        logDirectory,
        namespace: "default",
        langfuseConfig,
        deps: serviceDeps,
      }),
    ).rejects.toThrow("import_lifecycle_not_applicable:preflighted");
  });

  it("throws import_fingerprint_mismatch for wrong fingerprint", async () => {
    const logDirectory = mkdtempSync(path.join(tmpdir(), "cursor-usage-apply-"));
    const preflight = await preflightCsvImport({
      csvBytes: sampleCsv,
      exportWindow,
      namespace: "default",
      logDirectory,
      discoverLangfuse: false,
    });

    await expect(
      applyCsvImport({
        importId: preflight.importId,
        fingerprint: "wrong-fingerprint-value",
        confirmed: true,
        logDirectory,
        namespace: "default",
        langfuseConfig,
        deps: serviceDeps,
      }),
    ).rejects.toThrow("import_fingerprint_mismatch");
  });

  it("fails closed with zero writes when pricing rates change under same registry version", async () => {
    const { computeCostProxies } = await import(
      "../../src/evaluation/cursor-usage-import/proxy-cost.js"
    );
    // Zero cache buckets so list-rate pricing is complete and numeric cost scores emit.
    const pricedCsv = [
      "Date,Cloud Agent ID,Automation ID,Kind,Model,Max Mode,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost",
      "2026-07-19T12:00:00.000Z,bc-agent-planning-001,,Included,composer-2.5,false,0,100,0,50,150,Included",
      "2026-07-19T13:00:00.000Z,bc-agent-planreview-001,,Included,composer-2.5,false,0,80,0,40,120,Included",
    ].join("\n");
    const logDirectory = mkdtempSync(path.join(tmpdir(), "cursor-usage-apply-"));
    let scoreClientCalls = 0;
    const preflight = await preflightCsvImport({
      csvBytes: pricedCsv,
      exportWindow,
      namespace: "default",
      environment: "test",
      logDirectory,
      langfuseConfig,
      deps: {
        ...serviceDeps,
        discover: async () => ({
          candidates: readyDiscoverCandidates,
          retrievalComplete: true,
        }),
      },
    });
    expect(preflight.sourceScopeComplete).toBe(true);

    await expect(
      applyCsvImport({
        importId: preflight.importId,
        fingerprint: preflight.fingerprint,
        preflightApprovalFingerprint: preflight.preflightApprovalFingerprint,
        confirmed: true,
        logDirectory,
        namespace: "default",
        environment: "test",
        langfuseConfig,
        deps: {
          ...serviceDeps,
          discover: async () => ({
            candidates: readyDiscoverCandidates,
            retrievalComplete: true,
          }),
          createScoreClient: async () => {
            scoreClientCalls += 1;
            return { recordScore() {}, flush: async () => {} };
          },
          computeCostProxies: (params) => {
            const base = computeCostProxies(params);
            if (!base) return null;
            return {
              ...base,
              knownNoncacheCostUsd: base.knownNoncacheCostUsd + 1.23,
              allInputAtListRateUsd: base.allInputAtListRateUsd + 1.23,
              pricingManifest: {
                ...base.pricingManifest,
                inputUsdPer1M: "999.99",
              },
            };
          },
        },
      }),
    ).rejects.toThrow(/preflight_plan_changed/);

    expect(scoreClientCalls).toBe(0);
  });
});
