export type PhaseStartPhase =
  | "planning_start"
  | "implementation_start"
  | "revision_start"
  | "merge_start";

export type HarnessErrorPhase =
  | "planning"
  | "implementation"
  | "handoff"
  | "revision"
  | "merge";

const PHASE_START_LABELS: Record<PhaseStartPhase, string> = {
  planning_start: "Planning",
  implementation_start: "Building",
  revision_start: "Revision",
  merge_start: "Merge",
};

const COMPLETION_LABELS: Record<string, string> = {
  planning: "Planning complete",
  implementation: "Building complete",
  handoff: "PM handoff",
  revision: "Revision complete",
  merge: "Merge complete",
};

const ERROR_LABELS: Record<HarnessErrorPhase, string> = {
  planning: "Planning",
  implementation: "Building",
  handoff: "PM handoff",
  revision: "Revision",
  merge: "Merge",
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

export function formatHarnessUpdateHeader(label: string): string {
  return `🤖 Harness update — ${label}`;
}

export function formatHarnessErrorHeader(phase: HarnessErrorPhase): string {
  return `🤖 Harness error — ${getErrorLabel(phase)}`;
}
