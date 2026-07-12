import type { FirstRunStepId } from "@harness/setup/first-run-readiness";
import type { SetupGuiViewModel } from "@/lib/setup-server";

/** Number of guided setup steps before the "Ready for first run" completion state. */
export const GUIDED_SETUP_STEP_COUNT = 7;

const FIRST_RUN_STEP_ORDER: readonly FirstRunStepId[] = [
  "connect-services",
  "linear-workspace",
  "vercel-bridge",
  "local-setup",
  "local-readiness",
  "cloud-secrets",
  "target-workflow",
  "ready-for-first-run",
] as const;

/** Sub-steps within guided local setup workflow. */
export type GuidedLocalSetupStep = "connect-services" | "choose-target-repos";

/** Every screen the guided configure flow can display, including completion. */
export type GuidedDisplayStepId =
  | "connect-services"
  | "linear-workspace"
  | "vercel-bridge"
  | GuidedLocalSetupStep
  | "local-readiness"
  | "cloud-secrets"
  | "target-workflow"
  | "ready-for-first-run";

export const GUIDED_DISPLAY_STEP_ORDER: readonly GuidedDisplayStepId[] = [
  "connect-services",
  "linear-workspace",
  "vercel-bridge",
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
    case "connect-services":
      return "connect-services";
    case "linear-workspace":
      return "linear-workspace";
    case "vercel-bridge":
      return "vercel-bridge";
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
    summary.envKeyPresence.GITHUB_TOKEN &&
    summary.envKeyPresence.VERCEL_TOKEN
  );
}

function localEnvFileExists(summary: SetupGuiViewModel): boolean {
  return summary.localFiles.find((file) => file.label === ".env.local")?.exists ?? false;
}

export function localSetupFilesExist(summary: SetupGuiViewModel): boolean {
  return summary.overview.localFilesPresent;
}

/** Guided display step after Step 4 local file apply succeeds (first apply or update). */
export const GUIDED_DISPLAY_STEP_AFTER_LOCAL_APPLY: GuidedDisplayStepId =
  "local-readiness";

/** Guided display step when all target workflows are installed on production. */
export const GUIDED_DISPLAY_STEP_AFTER_WORKFLOW_READY: GuidedDisplayStepId =
  "ready-for-first-run";

/** Guided display step after service keys are saved in Step 1. */
export const GUIDED_DISPLAY_STEP_AFTER_CONNECT_SERVICES: GuidedDisplayStepId =
  "linear-workspace";

/** Guided display step after cloud secrets are verified and reviewed in Step 6. */
export const GUIDED_DISPLAY_STEP_AFTER_CLOUD_SECRETS: GuidedDisplayStepId =
  "target-workflow";

/**
 * Default guided screen after mount or when readiness advances forward.
 * Does not resurrect a manually visited earlier sub-step from browser/session storage.
 */
export function defaultGuidedDisplayStep(input: {
  currentStepId: FirstRunStepId;
  summary: SetupGuiViewModel;
}): GuidedDisplayStepId {
  switch (input.currentStepId) {
    case "connect-services":
      return "connect-services";
    case "linear-workspace":
      return "linear-workspace";
    case "vercel-bridge":
      return "vercel-bridge";
    case "local-setup":
      return localEnvFileExists(input.summary) && localSetupFilesExist(input.summary)
        ? "choose-target-repos"
        : "choose-target-repos";
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

export function compareFirstRunStepIds(
  left: FirstRunStepId,
  right: FirstRunStepId,
): number {
  return FIRST_RUN_STEP_ORDER.indexOf(left) - FIRST_RUN_STEP_ORDER.indexOf(right);
}

export function readinessStepAdvanced(
  next: FirstRunStepId,
  previous: FirstRunStepId,
): boolean {
  return compareFirstRunStepIds(next, previous) > 0;
}

/**
 * Whether readiness moving forward should update the guided display step.
 * Step 1 must not auto-advance to Linear workspace when keys become complete;
 * the user clicks Continue instead.
 */
export function shouldReadinessAdvanceGuidedDisplay(
  previous: FirstRunStepId,
  next: FirstRunStepId,
): boolean {
  if (
    previous === "connect-services" &&
    next === "linear-workspace"
  ) {
    return false;
  }
  return readinessStepAdvanced(next, previous);
}

export function isGuidedDisplayStepAllowed(
  target: GuidedDisplayStepId,
  currentStepId: FirstRunStepId,
): boolean {
  const maxAllowed = maxGuidedDisplayStepForReadiness(currentStepId);
  return compareGuidedDisplaySteps(target, maxAllowed) <= 0;
}

export function clampGuidedDisplayStep(input: {
  target: GuidedDisplayStepId;
  currentStepId: FirstRunStepId;
}): GuidedDisplayStepId {
  const maxAllowed = maxGuidedDisplayStepForReadiness(input.currentStepId);
  return compareGuidedDisplaySteps(input.target, maxAllowed) > 0
    ? maxAllowed
    : input.target;
}

export function connectServicesComplete(summary: SetupGuiViewModel): boolean {
  return localServiceKeysConfigured(summary);
}
