import type { FirstRunStepId } from "@harness/setup/first-run-readiness";
import type { SetupGuiViewModel } from "@/lib/setup-server";

/** Number of guided setup steps before the "Ready for first run" completion state. */
export const GUIDED_SETUP_STEP_COUNT = 5;

/** Sub-steps within guided Step 1–2 (local setup workflow). */
export type GuidedLocalSetupStep = "connect-services" | "choose-target-repos";

/** Every screen the guided configure flow can display, including completion. */
export type GuidedDisplayStepId =
  | GuidedLocalSetupStep
  | "local-readiness"
  | "cloud-secrets"
  | "target-workflow"
  | "ready-for-first-run";

export const GUIDED_DISPLAY_STEP_ORDER: readonly GuidedDisplayStepId[] = [
  "connect-services",
  "choose-target-repos",
  "local-readiness",
  "cloud-secrets",
  "target-workflow",
  "ready-for-first-run",
] as const;

export function guidedDisplayStepIndex(step: GuidedDisplayStepId): number {
  return GUIDED_DISPLAY_STEP_ORDER.indexOf(step);
}

export function getPreviousGuidedDisplayStep(
  step: GuidedDisplayStepId,
): GuidedDisplayStepId | null {
  const index = guidedDisplayStepIndex(step);
  if (index <= 0) {
    return null;
  }
  return GUIDED_DISPLAY_STEP_ORDER[index - 1] ?? null;
}

export function maxGuidedDisplayStepForReadiness(
  currentStepId: FirstRunStepId,
): GuidedDisplayStepId {
  switch (currentStepId) {
    case "local-setup":
      return "choose-target-repos";
    case "local-readiness":
      return "local-readiness";
    case "cloud-secrets":
      return "cloud-secrets";
    case "target-workflow":
      return "target-workflow";
    case "ready-for-first-run":
      return "ready-for-first-run";
  }
}

function localServiceKeysConfigured(summary: SetupGuiViewModel): boolean {
  return (
    summary.envKeyPresence.LINEAR_API_KEY &&
    summary.envKeyPresence.CURSOR_API_KEY &&
    summary.envKeyPresence.GITHUB_TOKEN
  );
}

function localEnvFileExists(summary: SetupGuiViewModel): boolean {
  return summary.localFiles.find((file) => file.label === ".env.local")?.exists ?? false;
}

/**
 * Default guided screen after mount or when readiness advances forward.
 * Does not resurrect a manually visited earlier sub-step from browser/session storage.
 */
export function defaultGuidedDisplayStep(input: {
  currentStepId: FirstRunStepId;
  summary: SetupGuiViewModel;
}): GuidedDisplayStepId {
  switch (input.currentStepId) {
    case "local-setup":
      return localEnvFileExists(input.summary) && localServiceKeysConfigured(input.summary)
        ? "choose-target-repos"
        : "connect-services";
    case "local-readiness":
      return "local-readiness";
    case "cloud-secrets":
      return "cloud-secrets";
    case "target-workflow":
      return "target-workflow";
    case "ready-for-first-run":
      return "ready-for-first-run";
  }
}

export function isGuidedLocalSetupStep(
  step: GuidedDisplayStepId,
): step is GuidedLocalSetupStep {
  return step === "connect-services" || step === "choose-target-repos";
}

export function shouldShowGuidedBackButton(step: GuidedDisplayStepId): boolean {
  return getPreviousGuidedDisplayStep(step) !== null;
}

export function compareGuidedDisplaySteps(
  left: GuidedDisplayStepId,
  right: GuidedDisplayStepId,
): number {
  return guidedDisplayStepIndex(left) - guidedDisplayStepIndex(right);
}

export function isGuidedDisplayStepAllowed(
  target: GuidedDisplayStepId,
  currentStepId: FirstRunStepId,
): boolean {
  const maxAllowed = maxGuidedDisplayStepForReadiness(currentStepId);
  return compareGuidedDisplaySteps(target, maxAllowed) <= 0;
}
