/**
 * Atomic workflow state apply: expected revision + evidence validation + transition identity.
 */

import type { ResolvedWorkflowDefinition } from "../definition/types.js";
import {
  evaluateTransition,
  type PhaseOutcome,
  type TransitionEvidence,
  type TransitionResult,
} from "../transition-engine.js";
import {
  decideConflictRetry,
  DEFAULT_WORKFLOW_STATE_MAX_RETRIES,
  type WorkflowStateConflictReason,
} from "./conflict.js";
import {
  loadOrBootstrapWorkflowState,
  type WorkflowStateStore,
} from "./store.js";
import type { WorkflowStateRecord } from "./types.js";

export interface ApplyWorkflowTransitionInput {
  store: WorkflowStateStore;
  issueKey: string;
  definition: ResolvedWorkflowDefinition;
  /** Caller-observed revision; must match authoritative state or apply rejects/retries. */
  expectedStateRevision: number;
  currentPhaseId: string;
  outcome: PhaseOutcome;
  evidence: TransitionEvidence;
  phaseExecutionId?: string;
  claimActiveRunId?: string;
  clearActiveRunId?: string;
  returnDestination?: string | null;
  maxRetries?: number;
  now?: () => string;
}

export interface ApplyWorkflowTransitionResult {
  ok: boolean;
  state: WorkflowStateRecord | null;
  transition: TransitionResult | null;
  reason: WorkflowStateConflictReason | string;
  attempts: number;
}

function buildNextState(input: {
  previous: WorkflowStateRecord;
  transition: TransitionResult;
  currentPhaseId: string;
  outcome: PhaseOutcome;
  phaseExecutionId?: string;
  claimActiveRunId?: string;
  clearActiveRunId?: string;
  returnDestination?: string | null;
  now: string;
}): WorkflowStateRecord {
  const completed = [...input.previous.completedPhaseIdentities];
  if (
    input.transition.accepted &&
    (input.outcome.kind === "success" ||
      input.outcome.kind === "review" ||
      input.outcome.kind === "human" ||
      input.outcome.kind === "claim")
  ) {
    const identity = `${input.currentPhaseId}:${input.outcome.attemptIdentity}`;
    if (!completed.includes(identity)) {
      completed.push(identity);
    }
  }

  let activeRunIdentities = [...input.previous.activeRunIdentities];
  if (input.claimActiveRunId) {
    activeRunIdentities = [input.claimActiveRunId];
  }
  if (input.clearActiveRunId) {
    activeRunIdentities = activeRunIdentities.filter(
      (id) => id !== input.clearActiveRunId,
    );
  }

  let lastAccepted = input.previous.lastAcceptedReviewDecision;
  if (
    input.transition.accepted &&
    input.outcome.kind === "review" &&
    input.outcome.review
  ) {
    lastAccepted = {
      decision: input.outcome.review.decision,
      decisionIdentity: input.outcome.review.decisionIdentity,
      phaseId: input.currentPhaseId,
      acceptedAt: input.now,
    };
  }

  return {
    ...input.previous,
    stateRevision: input.previous.stateRevision + 1,
    currentPhaseExecutionId:
      input.phaseExecutionId ??
      (input.claimActiveRunId ?? input.previous.currentPhaseExecutionId),
    currentPhaseId: input.transition.nextPhaseId,
    cycleCounters: {
      ...input.previous.cycleCounters,
      ...input.transition.updatedCounters,
    },
    lastAcceptedReviewDecision: lastAccepted,
    returnDestination:
      input.returnDestination !== undefined
        ? input.returnDestination
        : input.previous.returnDestination,
    activeRunIdentities,
    completedPhaseIdentities: completed,
    lastTransitionIdentity: input.transition.idempotencyIdentity,
    lastTransitionAt: input.now,
  };
}

function isSameAttempt(state: WorkflowStateRecord, attemptIdentity: string): boolean {
  if (!state.lastTransitionIdentity) return false;
  return state.lastTransitionIdentity.includes(attemptIdentity);
}

/**
 * Read latest state, validate evidence, evaluate transition, CAS-apply with bounded retry.
 */
export async function applyWorkflowTransition(
  input: ApplyWorkflowTransitionInput,
): Promise<ApplyWorkflowTransitionResult> {
  const maxRetries = input.maxRetries ?? DEFAULT_WORKFLOW_STATE_MAX_RETRIES;
  const now = input.now ?? (() => new Date().toISOString());
  let attempts = 0;
  let expectedRevision = input.expectedStateRevision;

  while (attempts < maxRetries) {
    attempts += 1;

    const persisted = await input.store.load(input.issueKey);
    const loaded =
      persisted ??
      (await loadOrBootstrapWorkflowState({
        store: input.store,
        issueKey: input.issueKey,
        workflowSchemaVersion: input.definition.schemaVersion,
        enabledOptionalPhases: {
          planReview: input.definition.enabledOptionalPhases.planReview,
          codeReview: input.definition.enabledOptionalPhases.codeReview,
        },
        currentPhaseId: input.currentPhaseId,
      }));

    if (persisted && loaded.stateRevision !== expectedRevision) {
      if (isSameAttempt(loaded, input.outcome.attemptIdentity)) {
        return {
          ok: true,
          state: loaded,
          transition: null,
          reason: "duplicate_transition",
          attempts,
        };
      }
      const retry = decideConflictRetry({
        attempt: attempts,
        maxRetries,
        casFailed: true,
      });
      if (!retry.retry) {
        return {
          ok: false,
          state: loaded,
          transition: null,
          reason: retry.reason,
          attempts,
        };
      }
      expectedRevision = loaded.stateRevision;
      continue;
    }

    // Stale expected revision against empty store (caller thought state existed).
    if (!persisted && expectedRevision !== 0) {
      return {
        ok: false,
        state: loaded,
        transition: null,
        reason: "stale_state",
        attempts,
      };
    }

    const evidence: TransitionEvidence = {
      ...input.evidence,
      completedPhaseIdentities: loaded.completedPhaseIdentities,
      supersededGenerationIds: loaded.supersededGenerationIdentities,
      lastAcceptedDecisionIdentity:
        loaded.lastAcceptedReviewDecision?.decisionIdentity,
      activeRunId: loaded.activeRunIdentities[0],
    };

    if (
      input.claimActiveRunId &&
      loaded.activeRunIdentities.length > 0 &&
      !loaded.activeRunIdentities.includes(input.claimActiveRunId)
    ) {
      return {
        ok: false,
        state: loaded,
        transition: null,
        reason: "active_run_conflict",
        attempts,
      };
    }

    if (
      input.outcome.generationId &&
      loaded.supersededGenerationIdentities.includes(input.outcome.generationId)
    ) {
      return {
        ok: false,
        state: loaded,
        transition: null,
        reason: "superseded_generation",
        attempts,
      };
    }

    const transition = evaluateTransition({
      definition: input.definition,
      currentPhaseId: input.currentPhaseId,
      outcome: input.outcome,
      cycleCounters: loaded.cycleCounters,
      evidence,
    });

    if (!transition.accepted) {
      if (
        transition.rejectReason === "duplicate_phase_completion" ||
        transition.rejectReason === "duplicate_decision"
      ) {
        return {
          ok: true,
          state: loaded,
          transition,
          reason: "duplicate_transition",
          attempts,
        };
      }
      return {
        ok: false,
        state: loaded,
        transition,
        reason: transition.rejectReason ?? "illegal_transition",
        attempts,
      };
    }

    const next = buildNextState({
      previous: loaded,
      transition,
      currentPhaseId: input.currentPhaseId,
      outcome: input.outcome,
      phaseExecutionId: input.phaseExecutionId,
      claimActiveRunId: input.claimActiveRunId,
      clearActiveRunId: input.clearActiveRunId,
      returnDestination: input.returnDestination,
      now: now(),
    });

    const casRevision = persisted ? expectedRevision : 0;
    if (!persisted) {
      next.stateRevision = 1;
    }

    const stored = await input.store.compareAndSet({
      issueKey: input.issueKey,
      expectedRevision: casRevision,
      next,
    });

    if (stored) {
      return {
        ok: true,
        state: stored,
        transition,
        reason: transition.reason,
        attempts,
      };
    }

    const retry = decideConflictRetry({
      attempt: attempts,
      maxRetries,
      casFailed: true,
    });
    const latest = await input.store.load(input.issueKey);
    if (latest && isSameAttempt(latest, input.outcome.attemptIdentity)) {
      return {
        ok: true,
        state: latest,
        transition,
        reason: "duplicate_transition",
        attempts,
      };
    }
    if (!retry.retry) {
      return {
        ok: false,
        state: latest,
        transition,
        reason: retry.reason,
        attempts,
      };
    }
    expectedRevision = latest?.stateRevision ?? expectedRevision;
  }

  return {
    ok: false,
    state: await input.store.load(input.issueKey),
    transition: null,
    reason: "conflict_exhausted",
    attempts,
  };
}

/**
 * Claim exclusive agent eligibility (one active run identity).
 */
export async function claimAgentRun(input: {
  store: WorkflowStateStore;
  issueKey: string;
  definition: ResolvedWorkflowDefinition;
  expectedStateRevision: number;
  currentPhaseId: string;
  runId: string;
  evidence: TransitionEvidence;
  maxRetries?: number;
}): Promise<ApplyWorkflowTransitionResult> {
  return applyWorkflowTransition({
    store: input.store,
    issueKey: input.issueKey,
    definition: input.definition,
    expectedStateRevision: input.expectedStateRevision,
    currentPhaseId: input.currentPhaseId,
    outcome: {
      kind: "claim",
      phaseId: input.currentPhaseId,
      attemptIdentity: input.runId,
    },
    evidence: input.evidence,
    claimActiveRunId: input.runId,
    phaseExecutionId: input.runId,
    maxRetries: input.maxRetries,
  });
}
