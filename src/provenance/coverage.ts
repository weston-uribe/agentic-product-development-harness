import { createHash } from "node:crypto";
import type { ProvenanceEvent } from "./events.js";
import {
  launchSurfacesManifestDigest,
  PROVENANCE_WRITER_VERSION,
  LAUNCH_SURFACES_SCHEMA_KIND,
} from "./launch-surfaces.js";
import { LAUNCH_CONTEXT_SCHEMA_KIND } from "./launch-context.js";
import { PROVENANCE_EVENT_SCHEMA_KIND } from "./events.js";
import { CursorProvenanceError } from "./errors.js";

export const COVERAGE_SCHEMA_KIND =
  "p-dev.cursor-cloud-agent-registry-coverage.v1" as const;

export type CoverageStatus = "complete" | "incomplete";

export interface CoverageInterval {
  /** Inclusive start. */
  coverageStart: string;
  /** Exclusive end. Never open-ended. */
  coverageEnd: string;
}

export interface CoverageSnapshot {
  kind: typeof COVERAGE_SCHEMA_KIND;
  version: "1";
  interval: CoverageInterval;
  status: CoverageStatus;
  writerVersion: string;
  contextSchemaKind: string;
  provenanceSchemaKind: string;
  launchSurfacesSchemaKind: string;
  launchSurfacesManifestVersion: string;
  launchSurfacesManifestDigest: string;
  sourceRepositoryVersions: string[];
  runnerSnapshotVersions: string[];
  immutableEventSetCommitSha: string;
  eventPathSet: string[];
  eventSetDigest: string;
  launchAttemptCount: number;
  acknowledgedAgentCount: number;
  runBindingCount: number;
  completedRunCount: number;
  unresolvedIntentCount: number;
  providerCallWithoutAckCount: number;
  ackWithoutRunBindCount: number;
  incompleteExecutionCount: number;
  writerDeploymentGaps: string[];
  mixedUnsupportedRunnerVersions: string[];
  duplicateDivergenceEvidence: string[];
  reconciliationTimestamp: string | null;
  coverageDigest: string;
}

export interface AttemptProjection {
  launchAttemptId: string;
  hasIntent: boolean;
  hasCallStarted: boolean;
  hasAgentAck: boolean;
  runBindings: Array<{
    runHash: string;
    startInclusive: string;
    endExclusive: string | null;
    completed: boolean;
  }>;
  launchFailedStages: string[];
  sourceRepositorySha: string | null;
  runnerSnapshotVersion: string | null;
  /** Earliest known activity instant for overlap. */
  activityStart: string | null;
  /** Latest known activity instant (null if still open). */
  activityEnd: string | null;
  unresolved: boolean;
}

function parseIso(value: string): number {
  return Date.parse(value);
}

/** Half-open overlap: [aStart, aEnd) overlaps [bStart, bEnd). */
export function intervalsOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string,
): boolean {
  const as = parseIso(aStart);
  const ae = aEnd === null ? Number.POSITIVE_INFINITY : parseIso(aEnd);
  const bs = parseIso(bStart);
  const be = parseIso(bEnd);
  if (![as, ae, bs, be].every(Number.isFinite) && aEnd !== null) {
    return true; // fail closed into inclusion on bad data
  }
  return as < be && ae > bs;
}

export function projectAttempts(events: ProvenanceEvent[]): AttemptProjection[] {
  const byAttempt = new Map<string, AttemptProjection>();

  const ensure = (id: string): AttemptProjection => {
    let row = byAttempt.get(id);
    if (!row) {
      row = {
        launchAttemptId: id,
        hasIntent: false,
        hasCallStarted: false,
        hasAgentAck: false,
        runBindings: [],
        launchFailedStages: [],
        sourceRepositorySha: null,
        runnerSnapshotVersion: null,
        activityStart: null,
        activityEnd: null,
        unresolved: true,
      };
      byAttempt.set(id, row);
    }
    return row;
  };

  const bumpActivity = (
    row: AttemptProjection,
    start: string | null,
    end: string | null,
  ) => {
    if (start) {
      if (!row.activityStart || parseIso(start) < parseIso(row.activityStart)) {
        row.activityStart = start;
      }
    }
    if (end) {
      if (!row.activityEnd || parseIso(end) > parseIso(row.activityEnd)) {
        row.activityEnd = end;
      }
    }
  };

  for (const event of events) {
    const row = ensure(event.launchAttemptId);
    row.sourceRepositorySha = event.sourceRepositorySha;
    row.runnerSnapshotVersion = event.runnerSnapshotVersion;
    bumpActivity(row, event.recordedAt, event.recordedAt);

    switch (event.eventType) {
      case "launch_intent":
        row.hasIntent = true;
        break;
      case "provider_call_started":
        row.hasCallStarted = true;
        break;
      case "provider_agent_acknowledged":
        row.hasAgentAck = true;
        break;
      case "provider_run_bound": {
        const existing = row.runBindings.find((r) => r.runHash === event.runHash);
        if (!existing) {
          row.runBindings.push({
            runHash: event.runHash,
            startInclusive: event.executionWindow.startInclusive,
            endExclusive: event.executionWindow.endExclusive,
            completed: false,
          });
        }
        bumpActivity(
          row,
          event.executionWindow.startInclusive,
          event.executionWindow.endExclusive,
        );
        break;
      }
      case "execution_completed": {
        let binding = row.runBindings.find((r) => r.runHash === event.runHash);
        if (!binding) {
          binding = {
            runHash: event.runHash,
            startInclusive: event.executionWindow.startInclusive,
            endExclusive: event.executionWindow.endExclusive,
            completed: true,
          };
          row.runBindings.push(binding);
        } else {
          binding.endExclusive = event.executionWindow.endExclusive;
          binding.completed = true;
        }
        bumpActivity(
          row,
          event.executionWindow.startInclusive,
          event.executionWindow.endExclusive,
        );
        break;
      }
      case "launch_failed":
        row.launchFailedStages.push(event.failureStage);
        break;
      default:
        break;
    }
  }

  for (const row of byAttempt.values()) {
    const missingAck = row.hasCallStarted && !row.hasAgentAck;
    const missingBind = row.hasAgentAck && row.runBindings.length === 0;
    const incompleteRun = row.runBindings.some((r) => !r.completed);
    const missingCall = row.hasIntent && !row.hasCallStarted;
    row.unresolved =
      missingCall ||
      missingAck ||
      missingBind ||
      incompleteRun ||
      (row.hasIntent && !row.hasCallStarted);
  }

  return [...byAttempt.values()];
}

export function attemptOverlapsInterval(
  attempt: AttemptProjection,
  interval: CoverageInterval,
): boolean {
  const start = attempt.activityStart ?? interval.coverageStart;
  // Unresolved attempts with open activityEnd remain open-ended for overlap.
  const end =
    attempt.activityEnd ??
    (attempt.unresolved ? null : attempt.activityStart);
  if (!end && !attempt.unresolved && attempt.activityStart) {
    return intervalsOverlap(
      attempt.activityStart,
      attempt.activityStart,
      interval.coverageStart,
      interval.coverageEnd,
    );
  }
  return intervalsOverlap(
    start,
    attempt.unresolved && !attempt.activityEnd ? null : end,
    interval.coverageStart,
    interval.coverageEnd,
  );
}

export function buildCoverageSnapshot(input: {
  interval: CoverageInterval;
  events: ProvenanceEvent[];
  eventPaths: string[];
  immutableEventSetCommitSha: string;
  reconciliationTimestamp?: string | null;
  supportedSourceVersions?: string[];
  supportedRunnerVersions?: string[];
}): CoverageSnapshot {
  const startMs = parseIso(input.interval.coverageStart);
  const endMs = parseIso(input.interval.coverageEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new CursorProvenanceError(
      "cursor_provenance_coverage_incomplete",
      "Coverage interval must be a closed half-open range with end > start.",
    );
  }

  const attempts = projectAttempts(input.events);
  const overlapping = attempts.filter((a) =>
    attemptOverlapsInterval(a, input.interval),
  );

  const unresolvedIntentCount = overlapping.filter(
    (a) => a.hasIntent && !a.hasCallStarted,
  ).length;
  const providerCallWithoutAckCount = overlapping.filter(
    (a) => a.hasCallStarted && !a.hasAgentAck,
  ).length;
  const ackWithoutRunBindCount = overlapping.filter(
    (a) => a.hasAgentAck && a.runBindings.length === 0,
  ).length;
  const incompleteExecutionCount = overlapping.filter((a) =>
    a.runBindings.some((r) => !r.completed),
  ).length;

  const stillOpenOverlaps = overlapping.some(
    (a) =>
      a.unresolved ||
      a.runBindings.some((r) => r.endExclusive === null) ||
      !a.activityEnd,
  );

  const sourceVersions = [
    ...new Set(
      overlapping
        .map((a) => a.sourceRepositorySha)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const runnerVersions = [
    ...new Set(
      overlapping
        .map((a) => a.runnerSnapshotVersion)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const supportedSource = new Set(
    input.supportedSourceVersions ?? sourceVersions,
  );
  const supportedRunner = new Set(
    input.supportedRunnerVersions ?? runnerVersions,
  );
  const mixedUnsupportedSourceVersions = sourceVersions.filter(
    (v) => !supportedSource.has(v),
  );
  const mixedUnsupportedRunnerVersions = runnerVersions.filter(
    (v) => !supportedRunner.has(v),
  );
  const writerDeploymentGaps: string[] = [];
  if (stillOpenOverlaps) {
    writerDeploymentGaps.push("overlapping_execution_not_terminal");
  }

  const eventSetDigest = createHash("sha256")
    .update(
      [...input.eventPaths].sort().join("\n") +
        "\n" +
        input.events
          .map((e) => e.canonicalSemanticDigest)
          .sort()
          .join("\n"),
      "utf8",
    )
    .digest("hex");

  let status: CoverageStatus = "complete";
  if (
    unresolvedIntentCount > 0 ||
    providerCallWithoutAckCount > 0 ||
    ackWithoutRunBindCount > 0 ||
    incompleteExecutionCount > 0 ||
    stillOpenOverlaps ||
    mixedUnsupportedRunnerVersions.length > 0 ||
    mixedUnsupportedSourceVersions.length > 0 ||
    writerDeploymentGaps.length > 0
  ) {
    status = "incomplete";
  }

  // Complete snapshots require all overlapping executions terminal/resolved.
  if (stillOpenOverlaps) {
    status = "incomplete";
  }

  const partial: Omit<CoverageSnapshot, "coverageDigest"> = {
    kind: COVERAGE_SCHEMA_KIND,
    version: "1",
    interval: input.interval,
    status,
    writerVersion: PROVENANCE_WRITER_VERSION,
    contextSchemaKind: LAUNCH_CONTEXT_SCHEMA_KIND,
    provenanceSchemaKind: PROVENANCE_EVENT_SCHEMA_KIND,
    launchSurfacesSchemaKind: LAUNCH_SURFACES_SCHEMA_KIND,
    launchSurfacesManifestVersion: "1",
    launchSurfacesManifestDigest: launchSurfacesManifestDigest(),
    sourceRepositoryVersions: sourceVersions,
    runnerSnapshotVersions: runnerVersions,
    immutableEventSetCommitSha: input.immutableEventSetCommitSha,
    eventPathSet: [...input.eventPaths].sort(),
    eventSetDigest,
    launchAttemptCount: overlapping.length,
    acknowledgedAgentCount: overlapping.filter((a) => a.hasAgentAck).length,
    runBindingCount: overlapping.reduce((n, a) => n + a.runBindings.length, 0),
    completedRunCount: overlapping.reduce(
      (n, a) => n + a.runBindings.filter((r) => r.completed).length,
      0,
    ),
    unresolvedIntentCount,
    providerCallWithoutAckCount,
    ackWithoutRunBindCount,
    incompleteExecutionCount,
    writerDeploymentGaps,
    mixedUnsupportedRunnerVersions,
    duplicateDivergenceEvidence: [],
    reconciliationTimestamp: input.reconciliationTimestamp ?? null,
  };

  const coverageDigest = createHash("sha256")
    .update(JSON.stringify(partial), "utf8")
    .digest("hex");

  return { ...partial, coverageDigest };
}

/**
 * Epoch records: a later clean epoch must not rewrite an earlier incomplete interval.
 */
export interface CoverageEpochRecord {
  epochId: string;
  activatedAt: string;
  activationCommitSha: string;
  writerVersion: string;
  status: "active" | "closed_incomplete" | "invalidated";
  closedAt: string | null;
  reason: string | null;
}
