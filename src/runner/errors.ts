import type { CursorCancelOutcome } from "../cursor/run-cleanup.js";

export class PhaseError extends Error {
  readonly classification: import("../types/run.js").ErrorClassification;
  readonly cancelOutcome: CursorCancelOutcome | null;

  constructor(
    classification: NonNullable<import("../types/run.js").ErrorClassification>,
    message: string,
    cancelOutcome: CursorCancelOutcome | null = null,
  ) {
    super(message);
    this.name = "PhaseError";
    this.classification = classification;
    this.cancelOutcome = cancelOutcome;
  }
}

export class PlanningError extends PhaseError {
  constructor(
    classification: NonNullable<import("../types/run.js").ErrorClassification>,
    message: string,
    cancelOutcome: import("../cursor/run-cleanup.js").CursorCancelOutcome | null = null,
  ) {
    super(classification, message, cancelOutcome);
    this.name = "PlanningError";
  }
}

export class ImplementationError extends PhaseError {
  constructor(
    classification: NonNullable<import("../types/run.js").ErrorClassification>,
    message: string,
    cancelOutcome: import("../cursor/run-cleanup.js").CursorCancelOutcome | null = null,
  ) {
    super(classification, message, cancelOutcome);
    this.name = "ImplementationError";
  }
}

export class HandoffError extends PhaseError {
  constructor(
    classification: NonNullable<import("../types/run.js").ErrorClassification>,
    message: string,
  ) {
    super(classification, message, null);
    this.name = "HandoffError";
  }
}
