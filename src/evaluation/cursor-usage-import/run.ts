import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { LangfuseInspectReport } from "../langfuse-inspect/types.js";
import {
  createLangfuseApiClient,
  fetchSessionScoresOnly,
} from "../langfuse-inspect/client.js";
import { resolveEvaluationConfig } from "../runtime.js";
import { deriveSessionId } from "../identifiers.js";
import { aggregateByCloudAgentId } from "./aggregate.js";
import {
  joinAggregatesToPhaseTraces,
  type AllowedImportPhase,
} from "./join.js";
import { digestCsvBytes, parseCursorUsageCsv, tokensSumValid } from "./parse.js";
import { computeCostProxies } from "./proxy-cost.js";
import { projectUsageScoresOnly } from "./project.js";
import { createScoreOnlyClient } from "./score-client.js";
import { attachmentFromJoin } from "./scores.js";
import {
  evaluateVerdicts,
  verifyImportedScores,
  type FetchedScore,
} from "./verify.js";
import {
  CURSOR_USAGE_CSV_SCHEMA_VERSION,
  CURSOR_USAGE_IMPORTER_VERSION,
  type CursorUsageImportPrivateReport,
  type CursorUsageImportPublicSummary,
  type PhaseImportAttachment,
} from "./types.js";

function mapFetchedScores(
  raw: Array<Record<string, unknown>>,
): FetchedScore[] {
  return raw.map((s) => {
    const traceId =
      typeof s.traceId === "string"
        ? s.traceId
        : typeof s.trace_id === "string"
          ? s.trace_id
          : null;
    return {
      id: typeof s.id === "string" ? s.id : "",
      name: typeof s.name === "string" ? s.name : "",
      traceId,
      value: s.value ?? s.stringValue ?? s.numberValue ?? null,
      dataType: typeof s.dataType === "string" ? s.dataType : null,
      timestamp:
        typeof s.timestamp === "string"
          ? s.timestamp
          : typeof s.createdAt === "string"
            ? s.createdAt
            : null,
    };
  });
}

export async function runCursorUsageImport(options: {
  csvPath: string;
  inspectReportPath: string;
  issueKey: string;
  namespace?: string;
  phases?: string[];
  dryRun?: boolean;
  out?: string;
  publicOut?: string;
  skipSecondImportVerify?: boolean;
}): Promise<{
  report: CursorUsageImportPrivateReport;
  exitCode: number;
}> {
  const issueKey = options.issueKey.trim();
  const allowedPhases = (options.phases?.length
    ? options.phases
    : ["planning", "plan_review"]) as AllowedImportPhase[];
  const dryRun = options.dryRun === true;

  const csvRaw = await readFile(options.csvPath, "utf8");
  const csvDigestSha256 = digestCsvBytes(csvRaw);
  const parsed = parseCursorUsageCsv(csvRaw);
  const inspectRaw = JSON.parse(
    await readFile(options.inspectReportPath, "utf8"),
  ) as LangfuseInspectReport;
  const namespace =
    options.namespace?.trim() ||
    inspectRaw.namespace?.trim() ||
    "default";

  const { aggregates, rejected } = aggregateByCloudAgentId(parsed.rows);
  const { joins, skipped: joinSkipped } = joinAggregatesToPhaseTraces({
    report: inspectRaw,
    aggregates,
    allowedPhases,
  });

  const skipped = [
    ...rejected.map((r) => ({
      reason: r.reason,
      cloudAgentIdHash: r.cloudAgentIdHash,
    })),
    ...joinSkipped,
  ];

  const attachments: PhaseImportAttachment[] = [];
  for (const { join, aggregate } of joins) {
    if (!tokensSumValid(aggregate.tokens)) {
      skipped.push({
        reason: "aggregate_token_sum_invalid",
        cloudAgentIdHash: aggregate.cloudAgentIdHash,
        phase: join.phase,
      });
      continue;
    }
    const proxies = computeCostProxies({
      modelId: "composer-2.5",
      effectiveVariant: join.effectiveVariant,
      tokens: aggregate.tokens,
    });
    if (!proxies) {
      skipped.push({
        reason: "pricing_lookup_failed",
        cloudAgentIdHash: aggregate.cloudAgentIdHash,
        phase: join.phase,
      });
      continue;
    }
    attachments.push(
      attachmentFromJoin({
        namespace,
        join,
        aggregate,
        proxies,
      }),
    );
  }

  let readAfterWrite: CursorUsageImportPrivateReport["readAfterWrite"];
  let verifyResult = null;

  if (!dryRun && attachments.length > 0) {
    const config = resolveEvaluationConfig(process.env);
    if (!config.ok) {
      skipped.push({ reason: "langfuse_runtime_unavailable" });
    } else {
      const scoreClient = await createScoreOnlyClient(config.config);
      if (!scoreClient) {
        skipped.push({ reason: "langfuse_score_client_unavailable" });
      } else {
        const allScores = attachments.flatMap((a) => a.scores);
        projectUsageScoresOnly({ recorder: scoreClient, scores: allScores });
        await scoreClient.flush();

        await new Promise((r) => setTimeout(r, 1500));

        const sessionId =
          inspectRaw.sessionId?.trim() ||
          deriveSessionId(namespace, issueKey);
        const attachedTraceIds = attachments.map((a) => a.join.traceId);
        const apiClient = await createLangfuseApiClient(config.config);
        const refetchScores = async (): Promise<FetchedScore[]> => {
          const rawScores = await Promise.race([
            fetchSessionScoresOnly(apiClient, sessionId, attachedTraceIds),
            new Promise<Array<Record<string, unknown>>>((_, reject) =>
              setTimeout(
                () => reject(new Error("score_refetch_timeout")),
                25_000,
              ),
            ),
          ]);
          return mapFetchedScores(rawScores);
        };

        let fetched: FetchedScore[] = [];
        try {
          fetched = await refetchScores();
        } catch (err) {
          skipped.push({
            reason: `score_refetch_failed:${
              err instanceof Error ? err.message.slice(0, 80) : "error"
            }`,
          });
          fetched = [];
        }
        verifyResult = verifyImportedScores({
          attachments,
          fetchedScores: fetched,
        });

        let logicalSecond: number | null = null;
        if (!options.skipSecondImportVerify) {
          projectUsageScoresOnly({
            recorder: scoreClient,
            scores: allScores,
          });
          await scoreClient.flush();
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const fetched2 = await refetchScores();
            const verify2 = verifyImportedScores({
              attachments,
              fetchedScores: fetched2,
            });
            logicalSecond = verify2.logicalScoreCount;
            if (logicalSecond > verifyResult.logicalScoreCount) {
              verifyResult.mismatches.push(
                "second_import_increased_score_count",
              );
              verifyResult.verified = false;
            }
          } catch {
            verifyResult.mismatches.push("second_import_refetch_failed");
            verifyResult.verified = false;
          }
        }

        readAfterWrite = {
          verified: verifyResult.verified,
          logicalScoreCountFirst: verifyResult.logicalScoreCount,
          logicalScoreCountSecond: logicalSecond,
          mismatches: verifyResult.mismatches,
        };
      }
    }
  } else if (dryRun) {
    // Dry-run: treat local score payloads as verified for local verdict scaffolding
    verifyResult = {
      verified: true,
      logicalScoreCount: attachments.length * 11,
      mismatches: [],
    };
  }

  const verdicts = evaluateVerdicts({
    arithmeticValid: parsed.arithmetic.identityHolds,
    attachments,
    verify: verifyResult,
    generationCostComplete: inspectRaw.acceptance?.generationCostComplete === true,
  });

  const publicSummary: CursorUsageImportPublicSummary = {
    schemaVersion: 1,
    kind: "cursor_usage_import_public",
    importerVersion: CURSOR_USAGE_IMPORTER_VERSION,
    dryRun,
    arithmeticValid: parsed.arithmetic.identityHolds,
    phasesAttached: [...new Set(attachments.map((a) => a.join.phase))],
    attachmentCount: attachments.length,
    observationMutationAttempted: false,
    tokenAcceptance: verdicts.tokenAcceptance,
    costProxyAvailability: verdicts.costProxyAvailability,
    exactMonetaryCostAcceptance: verdicts.exactMonetaryCostAcceptance,
    generationCostCompleteUnchanged: true,
  };

  const report: CursorUsageImportPrivateReport = {
    schemaVersion: 1,
    kind: "cursor_usage_import_private",
    preparedAt: new Date().toISOString(),
    importerVersion: CURSOR_USAGE_IMPORTER_VERSION,
    csvSchemaVersion: CURSOR_USAGE_CSV_SCHEMA_VERSION,
    issueKey,
    namespace,
    csvDigestSha256,
    dryRun,
    arithmeticValid: parsed.arithmetic.identityHolds,
    rowsParsed: parsed.rows.length,
    distinctAgents: aggregates.length,
    attachments: attachments.map((a) => ({
      phase: a.join.phase,
      traceId: a.join.traceId,
      cloudAgentIdHash: a.aggregate.cloudAgentIdHash,
      matchedRowCount: a.aggregate.rowCount,
      fingerprints: a.aggregate.fingerprints,
      tokens: a.aggregate.tokens,
      proxies: a.proxies,
      scoreIds: a.scores.map((s) => s.id),
      scoreTimestamp: a.join.traceEndTimestamp,
      attributionRationale:
        "csv_cloud_agent_id_equals_cursor_agent_id_single_allowed_phase_trace_window_fit",
      effectiveVariant: a.join.effectiveVariant,
    })),
    skipped,
    observationMutationAttempted: false,
    verdicts,
    readAfterWrite,
    publicSummary,
  };

  if (options.out) {
    await mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (options.publicOut) {
    await mkdir(path.dirname(path.resolve(options.publicOut)), {
      recursive: true,
    });
    await writeFile(
      options.publicOut,
      `${JSON.stringify(publicSummary, null, 2)}\n`,
      "utf8",
    );
  }

  const exitCode =
    verdicts.tokenAcceptance && verdicts.costProxyAvailability ? 0 : 2;
  return { report, exitCode };
}
