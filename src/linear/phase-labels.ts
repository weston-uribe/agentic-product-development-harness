export type PhaseStartPhase =
  | "planning_start"
  | "plan_review_start"
  | "implementation_start"
  | "revision_start"
  | "merge_start";

export type HarnessErrorPhase =
  | "planning"
  | "plan_review"
  | "implementation"
  | "handoff"
  | "revision"
  | "merge"
  | "production_sync";

const PHASE_START_LABELS: Record<PhaseStartPhase, string> = {
  planning_start: "Planning",
  plan_review_start: "Plan Review",
  implementation_start: "Building",
  revision_start: "Revision",
  merge_start: "Merging",
};

const COMPLETION_LABELS: Record<string, string> = {
  planning: "Planning complete",
  plan_review: "Plan Review complete",
  implementation: "Building complete",
  handoff: "PM handoff",
  revision: "Revision complete",
  merge: "Merge complete",
  production_sync: "Production promotion",
};

const ERROR_LABELS: Record<HarnessErrorPhase, string> = {
  planning: "Planning",
  plan_review: "Plan Review",
  implementation: "Building",
  handoff: "PM handoff",
  revision: "Revision",
  merge: "Merge",
  production_sync: "Production promotion",
};

export function getPhaseStartLabel(phase: PhaseStartPhase): string {
  return PHASE_START_LABELS[phase];
}

export function getCompletionLabel(phase: string): string {
  return COMPLETION_LABELS[phase] ?? phase;
}

export function getErrorLabel(phase: HarnessErrorPhase): string {
  return ERROR_LABELS[phase];
}

export function formatHarnessPhaseLabel(label: string): string {
  return label;
}

export function formatHarnessErrorPhaseLabel(phase: HarnessErrorPhase): string {
  return `${getErrorLabel(phase)} error`;
}
