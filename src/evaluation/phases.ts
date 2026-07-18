export const EVALUATION_PHASES = {
  implementation: { traceName: "p-dev.implementation" },
  handoff: { traceName: "p-dev.handoff" },
  revision: { traceName: "p-dev.revision" },
  merge: { traceName: "p-dev.merge" },
} as const;

export type EvaluationPhase = keyof typeof EVALUATION_PHASES;

export function getPhaseTraceName(phase: EvaluationPhase): string {
  return EVALUATION_PHASES[phase].traceName;
}

export function isEvaluationPhase(value: string): value is EvaluationPhase {
  return value in EVALUATION_PHASES;
}
