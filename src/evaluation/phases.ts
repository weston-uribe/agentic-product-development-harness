export const EVALUATION_PHASES = {
  planning: { traceName: "p-dev.planning", machineKey: "p-dev.planning" },
  implementation: {
    traceName: "p-dev.implementation",
    machineKey: "p-dev.implementation",
  },
  handoff: { traceName: "p-dev.handoff", machineKey: "p-dev.handoff" },
  revision: { traceName: "p-dev.revision", machineKey: "p-dev.revision" },
  merge: { traceName: "p-dev.merge", machineKey: "p-dev.merge" },
  integration_repair: {
    traceName: "p-dev.integration-repair",
    machineKey: "p-dev.integration-repair",
  },
} as const;

export type EvaluationPhase = keyof typeof EVALUATION_PHASES;

/** @deprecated Prefer human-readable display names via naming.phaseTraceDisplayName */
export function getPhaseTraceName(phase: EvaluationPhase): string {
  return EVALUATION_PHASES[phase].traceName;
}

export function getPhaseMachineKey(phase: EvaluationPhase): string {
  return EVALUATION_PHASES[phase].machineKey;
}

export function isEvaluationPhase(value: string): value is EvaluationPhase {
  return value in EVALUATION_PHASES;
}

/** Phases that invoke a real Cursor agent by default. */
export const AGENT_INVOKING_PHASES: ReadonlySet<EvaluationPhase> = new Set([
  "planning",
  "implementation",
  "revision",
  "integration_repair",
]);

export function phaseInvokesAgent(phase: EvaluationPhase): boolean {
  return AGENT_INVOKING_PHASES.has(phase);
}
