export class PlanningError extends Error {
  readonly classification: import("../types/run.js").ErrorClassification;

  constructor(
    classification: NonNullable<import("../types/run.js").ErrorClassification>,
    message: string,
  ) {
    super(message);
    this.name = "PlanningError";
    this.classification = classification;
  }
}
