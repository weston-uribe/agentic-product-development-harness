import {
  extractIssueKeyFromDisplayName,
  isPlannerAgentDisplayName,
  isPlanningTraceDisplayName,
  sessionDisplayName,
} from "../naming.js";
import {
  contentPresence,
  metadataNumber,
  metadataString,
} from "./client.js";
import type {
  LangfuseInspectGap,
  LangfuseInspectObservation,
  LangfuseInspectReport,
  LangfuseInspectScore,
  LangfuseInspectTrace,
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeMetadata(
  value: unknown,
): Record<string, unknown> | null {
  return asRecord(value);
}

function mapScore(raw: Record<string, unknown>): LangfuseInspectScore {
  return {
    id: typeof raw.id === "string" ? raw.id : String(raw.id ?? ""),
    name: typeof raw.name === "string" ? raw.name : "unknown",
    traceId: typeof raw.traceId === "string" ? raw.traceId : null,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : null,
    observationId:
      typeof raw.observationId === "string" ? raw.observationId : null,
    dataType: typeof raw.dataType === "string" ? raw.dataType : null,
    value: raw.value ?? raw.stringValue ?? raw.numberValue ?? null,
    timestamp:
      typeof raw.timestamp === "string"
        ? raw.timestamp
        : raw.createdAt
          ? String(raw.createdAt)
          : null,
  };
}

function mapObservation(
  raw: Record<string, unknown>,
): LangfuseInspectObservation {
  const metadata = normalizeMetadata(raw.metadata) ?? {};
  const inputInfo = contentPresence(raw.input);
  const outputInfo = contentPresence(raw.output);
  const usageRaw = asRecord(raw.usageDetails) ?? asRecord(raw.usage);
  const usage: Record<string, number> | null = usageRaw
    ? Object.fromEntries(
        Object.entries(usageRaw).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      )
    : null;
  const costDetails = asRecord(raw.costDetails);
  const totalCost =
    typeof costDetails?.total === "number"
      ? costDetails.total
      : typeof raw.calculatedTotalCost === "number"
        ? raw.calculatedTotalCost
        : metadataNumber(metadata, "costUsd");

  const skillIds: string[] = [];
  const skillsUsed = metadata.skillsUsed;
  if (Array.isArray(skillsUsed)) {
    for (const s of skillsUsed) {
      if (typeof s === "string") skillIds.push(s);
      else {
        const rec = asRecord(s);
        if (rec && typeof rec.skillId === "string") skillIds.push(rec.skillId);
      }
    }
  }

  const name = typeof raw.name === "string" ? raw.name : null;
  const linearIssueKey =
    metadataString(metadata, "linearIssueKey") ??
    metadataString(metadata, "issueKey") ??
    extractIssueKeyFromDisplayName(name);

  return {
    id: typeof raw.id === "string" ? raw.id : String(raw.id ?? ""),
    name,
    type: typeof raw.type === "string" ? raw.type : null,
    startTime:
      typeof raw.startTime === "string"
        ? raw.startTime
        : raw.startTime
          ? String(raw.startTime)
          : null,
    endTime:
      typeof raw.endTime === "string"
        ? raw.endTime
        : raw.endTime
          ? String(raw.endTime)
          : null,
    model:
      typeof raw.model === "string"
        ? raw.model
        : metadataString(metadata, "modelId"),
    hasInput: inputInfo.has,
    hasOutput: outputInfo.has,
    inputByteCount: inputInfo.byteCount,
    outputByteCount: outputInfo.byteCount,
    inputSha256: inputInfo.sha256,
    outputSha256: outputInfo.sha256,
    usage,
    costUsd: totalCost,
    costSource: metadataString(metadata, "costSource"),
    costUnavailableReason: metadataString(metadata, "costUnavailableReason"),
    pricingRegistryVersion: metadataString(metadata, "pricingRegistryVersion"),
    promptName: metadataString(metadata, "promptName"),
    promptContractVersion: metadataString(metadata, "promptContractVersion"),
    skillIds,
    skillProvenanceStatus: metadataString(metadata, "skillProvenanceStatus"),
    toolCount: asArray(raw.observations).length,
    agentId:
      metadataString(metadata, "cursorAgentId") ??
      metadataString(metadata, "agentId"),
    cursorRunId: metadataString(metadata, "cursorRunId"),
    linearIssueKey,
    phase: metadataString(metadata, "phase"),
    phaseExecutionId: metadataString(metadata, "phaseExecutionId"),
    harnessRunId:
      metadataString(metadata, "harnessRunId") ??
      metadataString(metadata, "pDevRunId"),
    revisionCycleIndex: metadataNumber(metadata, "revisionCycleIndex"),
    metadata,
  };
}

function generationCostComplete(obs: LangfuseInspectObservation): boolean {
  if (obs.type !== "GENERATION" && obs.type !== "generation") {
    // Also treat names containing Cursor run as generations
    if (!obs.name?.includes("Cursor run") && !obs.name?.includes("aggregate")) {
      return true;
    }
  }
  if (!obs.costSource) return false;
  if (obs.costSource === "unavailable") {
    return Boolean(obs.costUnavailableReason);
  }
  if (obs.costSource === "pricing_registry") {
    return (
      typeof obs.costUsd === "number" && Boolean(obs.pricingRegistryVersion)
    );
  }
  if (obs.costSource === "provider") {
    return typeof obs.costUsd === "number";
  }
  return false;
}

export function buildInspectReport(params: {
  issueKey: string;
  namespace: string;
  sessionId: string;
  session: Record<string, unknown> | null;
  traces: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  scores: Array<Record<string, unknown>>;
  artifactRuns?: Array<{
    runId: string;
    phase: string | null;
    sessionId: string | null;
    traceId: string | null;
  }>;
  includeSafeContent?: boolean;
}): LangfuseInspectReport {
  const issueKey = params.issueKey.trim();
  const obsByTrace = new Map<string, LangfuseInspectObservation[]>();
  for (const raw of params.observations) {
    const obs = mapObservation(raw);
    const traceId =
      typeof raw.traceId === "string"
        ? raw.traceId
        : typeof asRecord(raw)?.traceId === "string"
          ? String(raw.traceId)
          : null;
    if (!traceId) continue;
    const list = obsByTrace.get(traceId) ?? [];
    list.push(obs);
    obsByTrace.set(traceId, list);
  }

  const allScores = params.scores.map(mapScore);
  const scoresByTrace = new Map<string, LangfuseInspectScore[]>();
  for (const s of allScores) {
    if (!s.traceId) continue;
    const list = scoresByTrace.get(s.traceId) ?? [];
    list.push(s);
    scoresByTrace.set(s.traceId, list);
  }

  const gaps: LangfuseInspectGap[] = [];
  const traces: LangfuseInspectTrace[] = [];

  for (const raw of params.traces) {
    const id = typeof raw.id === "string" ? raw.id : "";
    const name = typeof raw.name === "string" ? raw.name : null;
    const metadata = normalizeMetadata(raw.metadata) ?? {};
    const linearIssueKey =
      metadataString(metadata, "linearIssueKey") ??
      metadataString(metadata, "issueKey") ??
      extractIssueKeyFromDisplayName(name);
    const usesHumanReadableName = Boolean(
      name && extractIssueKeyFromDisplayName(name),
    );
    const isLegacyMachineName = Boolean(
      name && /^p-dev\./.test(name) && !usesHumanReadableName,
    );
    const issueIdentityMissing = !linearIssueKey;
    // Legacy pre-contract traces (p-dev.*) are warnings; human-readable names must carry identity.
    if (issueIdentityMissing) {
      gaps.push({
        code: "missing_visible_issue_key",
        severity: usesHumanReadableName || !isLegacyMachineName ? "error" : "warning",
        message: `Trace ${id || name || "unknown"} lacks visible Linear issue identity`,
        traceId: id || undefined,
      });
    } else if (linearIssueKey.toUpperCase() !== issueKey.toUpperCase()) {
      gaps.push({
        code: "issue_identity_conflict",
        severity: "error",
        message: `Trace ${id} identity ${linearIssueKey} conflicts with requested ${issueKey}`,
        traceId: id || undefined,
      });
    }

    const observations = obsByTrace.get(id) ?? [];
    // Include nested from trace payload
    for (const nested of asArray(raw.observations)) {
      const rec = asRecord(nested);
      if (!rec) continue;
      const mapped = mapObservation(rec);
      if (!observations.some((o) => o.id === mapped.id)) {
        observations.push(mapped);
      }
    }

    for (const obs of observations) {
      if (!obs.linearIssueKey) {
        gaps.push({
          code: "observation_missing_issue_key",
          severity: "error",
          message: `Observation ${obs.name ?? obs.id} missing issue identity`,
          traceId: id || undefined,
          observationId: obs.id,
        });
      }
      if (
        (obs.type === "GENERATION" ||
          obs.type === "generation" ||
          obs.name?.includes("Cursor run")) &&
        !generationCostComplete(obs)
      ) {
        gaps.push({
          code: "incomplete_cost_record",
          severity: "error",
          message: `Generation ${obs.name ?? obs.id} lacks complete cost record`,
          traceId: id || undefined,
          observationId: obs.id,
        });
      }
    }

    const inputInfo = contentPresence(raw.input);
    const outputInfo = contentPresence(raw.output);

    traces.push({
      id,
      name,
      sessionId:
        typeof raw.sessionId === "string"
          ? raw.sessionId
          : params.sessionId,
      timestamp:
        typeof raw.timestamp === "string"
          ? raw.timestamp
          : raw.timestamp
            ? String(raw.timestamp)
            : null,
      linearIssueKey,
      phase: metadataString(metadata, "phase"),
      phaseExecutionId: metadataString(metadata, "phaseExecutionId"),
      harnessRunId:
        metadataString(metadata, "harnessRunId") ??
        metadataString(metadata, "pDevRunId"),
      revisionCycleIndex: metadataNumber(metadata, "revisionCycleIndex"),
      hasInput: inputInfo.has,
      hasOutput: outputInfo.has,
      observations,
      scores: scoresByTrace.get(id) ?? [],
      issueIdentityMissing,
    });
  }

  const planningTraceNames = traces
    .filter((t) => isPlanningTraceDisplayName(t.name, issueKey) || t.phase === "planning")
    .map((t) => t.name ?? t.id);
  const dedicatedPlanning = traces.some((t) =>
    isPlanningTraceDisplayName(t.name, issueKey),
  );
  if (!dedicatedPlanning) {
    gaps.push({
      code: "missing_planning_trace",
      severity: "error",
      message: `Missing dedicated planning trace named like "${issueKey} · planning"`,
    });
  }

  const agentObservationNames: string[] = [];
  const plannerAgentNames: string[] = [];
  for (const t of traces) {
    for (const o of t.observations) {
      if (
        o.type === "AGENT" ||
        o.type === "agent" ||
        o.name?.includes(" · planner") ||
        o.name?.includes(" · implementer") ||
        o.name?.includes(" · reviser")
      ) {
        if (o.name) agentObservationNames.push(o.name);
        if (isPlannerAgentDisplayName(o.name, issueKey)) {
          plannerAgentNames.push(o.name!);
        }
      }
    }
  }
  if (plannerAgentNames.length === 0) {
    gaps.push({
      code: "missing_planner_agent",
      severity: "error",
      message: `Missing planner agent observation named like "${issueKey} · planner"`,
    });
  }

  const conflictingCorrelations: LangfuseInspectReport["artifactComparison"]["conflictingCorrelations"] =
    [];
  for (const run of params.artifactRuns ?? []) {
    if (run.sessionId && run.sessionId !== params.sessionId) {
      conflictingCorrelations.push({
        traceId: run.traceId ?? "",
        field: "sessionId",
        langfuseValue: params.sessionId,
        artifactValue: run.sessionId,
      });
    }
    if (run.traceId) {
      const match = traces.find((t) => t.id === run.traceId);
      if (match && match.harnessRunId && run.runId && match.harnessRunId !== run.runId) {
        conflictingCorrelations.push({
          traceId: run.traceId,
          field: "harnessRunId",
          langfuseValue: match.harnessRunId,
          artifactValue: run.runId,
        });
      }
    }
  }
  for (const c of conflictingCorrelations) {
    gaps.push({
      code: "artifact_correlation_conflict",
      severity: "error",
      message: `Correlation conflict on ${c.field} for trace ${c.traceId}`,
      traceId: c.traceId || undefined,
    });
  }

  const generationObs = traces.flatMap((t) =>
    t.observations.filter(
      (o) =>
        o.type === "GENERATION" ||
        o.type === "generation" ||
        o.name?.includes("Cursor run"),
    ),
  );
  const generationCostCompleteAll =
    generationObs.length === 0
      ? false
      : generationObs.every(generationCostComplete);

  const missingVisibleIssueKey = traces.some(
    (t) =>
      t.issueIdentityMissing &&
      Boolean(t.name && extractIssueKeyFromDisplayName(t.name)),
  );
  const scoreNames = [...new Set(allScores.map((s) => s.name))];

  const sessionMeta = normalizeMetadata(params.session?.metadata);
  const sessionDisplay =
    (typeof params.session?.name === "string" ? params.session.name : null) ??
    metadataString(sessionMeta, "linearIssueKey") ??
    sessionDisplayName(issueKey);

  // Complete when human-readable planning+planner exist and no error-severity gaps remain.
  // Legacy p-dev.* traces may still be present as warnings.
  const complete =
    gaps.filter((g) => g.severity === "error").length === 0 &&
    dedicatedPlanning &&
    plannerAgentNames.length > 0 &&
    !missingVisibleIssueKey;

  const report: LangfuseInspectReport = {
    schemaVersion: 1,
    issueKey,
    namespace: params.namespace,
    sessionId: params.sessionId,
    sessionDisplayName: sessionDisplay,
    inspectedAt: new Date().toISOString(),
    traces,
    scores: allScores,
    gaps,
    acceptance: {
      complete,
      missingVisibleIssueKey,
      hasPlanningTrace: dedicatedPlanning,
      hasPlannerAgent: plannerAgentNames.length > 0,
      planningTraceNames,
      plannerAgentNames,
      agentObservationNames,
      generationCostComplete: generationCostCompleteAll,
      scoreNames,
    },
    artifactComparison: {
      localRunCount: params.artifactRuns?.length ?? 0,
      conflictingCorrelations,
    },
  };

  if (params.includeSafeContent) {
    report.safeContent = {
      observations: traces.flatMap((t) =>
        t.observations.map((o) => ({
          id: o.id,
          inputSha256: o.inputSha256,
          outputSha256: o.outputSha256,
          inputByteCount: o.inputByteCount,
          outputByteCount: o.outputByteCount,
          redactionStatus:
            typeof o.metadata.redactionStatus === "string"
              ? o.metadata.redactionStatus
              : null,
        })),
      ),
    };
  }

  return report;
}
