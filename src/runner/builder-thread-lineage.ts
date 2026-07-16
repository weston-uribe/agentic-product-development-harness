import { parseHarnessMarkers } from "../linear/markers.js";
import type { LinearCommentRecord } from "../linear/writer.js";
import { normalizeRepoUrl } from "../resolver/normalize-repo.js";
import type {
  BuilderThreadMarkerEvidence,
  BuilderThreadReference,
  BuilderThreadSourcePhase,
} from "./builder-thread-types.js";

const BUILDER_START_PHASES = new Set([
  "implementation_start",
  "revision_start",
  "repair_agent_start",
]);

const BUILDER_CARRY_PHASES = new Set([
  "implementation_start",
  "implementation",
  "handoff",
  "revision_start",
  "revision",
  "repair_agent_start",
  "repair_complete",
]);

export interface ResolveBuilderThreadInput {
  comments: LinearCommentRecord[];
  orchestratorMarker: string;
  issueKey: string;
  targetRepo: string;
  branch?: string;
  prUrl?: string;
  previousImplementationRunId?: string;
  previousRevisionRunId?: string;
}

interface CandidateMarker {
  markers: ReturnType<typeof parseHarnessMarkers>;
  createdAt: number;
  commentId: string;
}

function parseTime(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOrchestratorMarker(
  markers: ReturnType<typeof parseHarnessMarkers>,
  orchestratorMarker: string,
): boolean {
  return (
    markers.orchestratorMarker === orchestratorMarker &&
    Boolean(markers.phase) &&
    Boolean(markers.runId)
  );
}

function readGeneration(markers: ReturnType<typeof parseHarnessMarkers>): number {
  const raw = markers.builderThreadGeneration;
  if (raw === undefined || raw === "") {
    return 1;
  }
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return Number.NaN;
  }
  return parsed;
}

function resolveBuilderAgentId(
  markers: ReturnType<typeof parseHarnessMarkers>,
): string | undefined {
  if (markers.builderAgentId) {
    return markers.builderAgentId;
  }
  const phase = markers.phase;
  if (phase && BUILDER_START_PHASES.has(phase) && markers.cursorAgentId) {
    return markers.cursorAgentId;
  }
  return undefined;
}

function sourcePhaseFromMarkerPhase(
  phase: string | undefined,
): BuilderThreadSourcePhase | undefined {
  if (phase === "implementation_start" || phase === "implementation" || phase === "handoff") {
    return "implementation";
  }
  if (phase === "revision_start" || phase === "revision") {
    return "revision";
  }
  if (phase === "repair_agent_start" || phase === "repair_complete") {
    return "integration_repair";
  }
  return undefined;
}

function matchesLineageContext(
  markers: ReturnType<typeof parseHarnessMarkers>,
  input: ResolveBuilderThreadInput,
): boolean {
  if (markers.issueKey && markers.issueKey !== input.issueKey) {
    return false;
  }
  if (markers.targetRepo) {
    const markerRepo = normalizeRepoUrl(markers.targetRepo);
    const expectedRepo = normalizeRepoUrl(input.targetRepo);
    if (markerRepo !== expectedRepo) {
      return false;
    }
  }
  if (input.prUrl && markers.prUrl && markers.prUrl !== input.prUrl) {
    return false;
  }
  if (input.branch && markers.branch && markers.branch !== input.branch) {
    return false;
  }
  if (
    input.previousImplementationRunId &&
    markers.runId === input.previousImplementationRunId &&
    markers.phase === "implementation_start"
  ) {
    return true;
  }
  if (
    input.previousRevisionRunId &&
    markers.runId === input.previousRevisionRunId &&
    (markers.phase === "revision_start" || markers.phase === "revision")
  ) {
    return true;
  }
  return true;
}

function toReference(
  markers: ReturnType<typeof parseHarnessMarkers>,
  input: ResolveBuilderThreadInput,
): BuilderThreadReference | null {
  const agentId = resolveBuilderAgentId(markers);
  if (!agentId) {
    return null;
  }
  const generation = readGeneration(markers);
  if (Number.isNaN(generation)) {
    return null;
  }
  const sourcePhase = sourcePhaseFromMarkerPhase(markers.phase);
  if (!sourcePhase) {
    return null;
  }
  const originRunId =
    markers.builderOriginRunId ?? markers.runId ?? input.previousImplementationRunId;
  if (!originRunId) {
    return null;
  }
  return {
    agentId,
    generation,
    originHarnessRunId: originRunId,
    latestHarnessRunId: markers.runId ?? originRunId,
    sourcePhase,
    targetRepo: normalizeRepoUrl(markers.targetRepo ?? input.targetRepo),
    branch: markers.branch ?? input.branch,
    prUrl: markers.prUrl ?? input.prUrl,
    idempotencyKey: markers.builderThreadIdempotencyKey,
  };
}

function collectCandidates(
  comments: LinearCommentRecord[],
  orchestratorMarker: string,
): CandidateMarker[] {
  const candidates: CandidateMarker[] = [];
  for (const comment of comments) {
    const markers = parseHarnessMarkers(comment.body);
    if (!isOrchestratorMarker(markers, orchestratorMarker)) {
      continue;
    }
    if (!markers.phase || !BUILDER_CARRY_PHASES.has(markers.phase)) {
      continue;
    }
    if (!resolveBuilderAgentId(markers)) {
      continue;
    }
    candidates.push({
      markers,
      createdAt: parseTime(comment.createdAt),
      commentId: comment.id,
    });
  }
  return candidates;
}

export function resolveBuilderThreadReference(
  input: ResolveBuilderThreadInput,
): BuilderThreadReference | null {
  const candidates = collectCandidates(input.comments, input.orchestratorMarker)
    .filter((candidate) => matchesLineageContext(candidate.markers, input))
    .map((candidate) => ({
      candidate,
      reference: toReference(candidate.markers, input),
      generation: readGeneration(candidate.markers),
    }))
    .filter(
      (
        entry,
      ): entry is {
        candidate: CandidateMarker;
        reference: BuilderThreadReference;
        generation: number;
      } => entry.reference !== null && !Number.isNaN(entry.generation),
    );

  if (candidates.length === 0) {
    return null;
  }

  const maxGeneration = Math.max(...candidates.map((entry) => entry.generation));
  const atMaxGeneration = candidates.filter(
    (entry) => entry.generation === maxGeneration,
  );
  atMaxGeneration.sort((a, b) => b.candidate.createdAt - a.candidate.createdAt);
  return atMaxGeneration[0]?.reference ?? null;
}

export function resolveBuilderThreadMarkerEvidence(
  input: ResolveBuilderThreadInput,
): BuilderThreadMarkerEvidence | null {
  const candidates = collectCandidates(input.comments, input.orchestratorMarker)
    .filter((candidate) => matchesLineageContext(candidate.markers, input))
    .map((candidate) => ({
      candidate,
      generation: readGeneration(candidate.markers),
    }))
    .filter((entry) => !Number.isNaN(entry.generation));

  if (candidates.length === 0) {
    return null;
  }

  const maxGeneration = Math.max(...candidates.map((entry) => entry.generation));
  const atMaxGeneration = candidates
    .filter((entry) => entry.generation === maxGeneration)
    .sort((a, b) => b.candidate.createdAt - a.candidate.createdAt);
  const winner = atMaxGeneration[0]?.candidate.markers;
  if (!winner) {
    return null;
  }
  const agentId = resolveBuilderAgentId(winner);
  if (!agentId) {
    return null;
  }
  return {
    builderAgentId: agentId,
    builderThreadGeneration: readGeneration(winner),
    builderThreadAction: winner.builderThreadAction as BuilderThreadMarkerEvidence["builderThreadAction"],
    builderOriginRunId: winner.builderOriginRunId ?? winner.runId,
    builderThreadIdempotencyKey: winner.builderThreadIdempotencyKey,
    previousBuilderAgentId: winner.previousBuilderAgentId,
    builderThreadReplacementReason:
      winner.builderThreadReplacementReason as BuilderThreadMarkerEvidence["builderThreadReplacementReason"],
  };
}

export function findImplementationStartBuilderAgentId(
  comments: LinearCommentRecord[],
  orchestratorMarker: string,
  implementationRunId: string,
  targetRepo: string,
): string | null {
  for (const comment of comments) {
    const markers = parseHarnessMarkers(comment.body);
    if (
      markers.orchestratorMarker !== orchestratorMarker ||
      markers.phase !== "implementation_start" ||
      markers.runId !== implementationRunId
    ) {
      continue;
    }
    if (
      markers.targetRepo &&
      normalizeRepoUrl(markers.targetRepo) !== normalizeRepoUrl(targetRepo)
    ) {
      continue;
    }
    return resolveBuilderAgentId(markers) ?? null;
  }
  return null;
}
