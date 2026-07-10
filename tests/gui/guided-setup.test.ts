import { describe, expect, it } from "vitest";
import {
  compareGuidedDisplaySteps,
  clampGuidedDisplayStep,
  defaultGuidedDisplayStep,
  getPreviousGuidedDisplayStep,
  GUIDED_DISPLAY_STEP_AFTER_CONNECT_SERVICES,
  GUIDED_DISPLAY_STEP_AFTER_LOCAL_APPLY,
  GUIDED_DISPLAY_STEP_AFTER_WORKFLOW_READY,
  GUIDED_SETUP_STEP_COUNT,
  isGuidedDisplayStepAllowed,
  localSetupFilesExist,
  readinessStepAdvanced,
  shouldShowGuidedBackButton,
} from "../../apps/gui/lib/guided-setup";
import type { SetupGuiViewModel } from "../../src/setup/gui-view-model";

function summary(partial: Partial<SetupGuiViewModel>): SetupGuiViewModel {
  return {
    overview: {
      configResolved: false,
      operatorConfigResolved: false,
      readyForLocalDoctor: false,
    },
    envKeyPresence: {
      HARNESS_CONFIG_PATH: false,
      LINEAR_API_KEY: false,
      CURSOR_API_KEY: false,
      GITHUB_TOKEN: false,
      VERCEL_TOKEN: false,
    },
    localFiles: [],
    ...partial,
  } as SetupGuiViewModel;
}

describe("guided-setup navigation", () => {
  it("uses a seven-step guided flow before completion", () => {
    expect(GUIDED_SETUP_STEP_COUNT).toBe(7);
  });

  it("maps each guided step to the previous step", () => {
    expect(getPreviousGuidedDisplayStep("connect-services")).toBeNull();
    expect(getPreviousGuidedDisplayStep("linear-workspace")).toBe(
      "connect-services",
    );
    expect(getPreviousGuidedDisplayStep("vercel-bridge")).toBe(
      "linear-workspace",
    );
    expect(getPreviousGuidedDisplayStep("choose-target-repos")).toBe(
      "vercel-bridge",
    );
    expect(getPreviousGuidedDisplayStep("local-readiness")).toBe(
      "choose-target-repos",
    );
    expect(getPreviousGuidedDisplayStep("cloud-secrets")).toBe("local-readiness");
    expect(getPreviousGuidedDisplayStep("target-workflow")).toBe("cloud-secrets");
    expect(getPreviousGuidedDisplayStep("ready-for-first-run")).toBe(
      "target-workflow",
    );
  });

  it("shows Back only after Step 1", () => {
    expect(shouldShowGuidedBackButton("connect-services")).toBe(false);
    expect(shouldShowGuidedBackButton("linear-workspace")).toBe(true);
    expect(shouldShowGuidedBackButton("choose-target-repos")).toBe(true);
    expect(shouldShowGuidedBackButton("ready-for-first-run")).toBe(true);
  });

  it("defaults fresh mount to readiness current step", () => {
    expect(
      defaultGuidedDisplayStep({
        currentStepId: "linear-workspace",
        summary: summary({}),
      }),
    ).toBe("linear-workspace");

    expect(
      defaultGuidedDisplayStep({
        currentStepId: "cloud-secrets",
        summary: summary({}),
      }),
    ).toBe("cloud-secrets");
  });

  it("defaults connect-services for the first readiness step", () => {
    expect(
      defaultGuidedDisplayStep({
        currentStepId: "connect-services",
        summary: summary({}),
      }),
    ).toBe("connect-services");
  });

  it("defaults local-setup to choose-target-repos", () => {
    expect(
      defaultGuidedDisplayStep({
        currentStepId: "local-setup",
        summary: summary({
          localFiles: [{ label: ".env.local", exists: true, path: ".env.local" }],
          overview: { localFilesPresent: true },
        }),
      }),
    ).toBe("choose-target-repos");
  });

  it("does not allow navigating forward past readiness current step", () => {
    expect(
      isGuidedDisplayStepAllowed("vercel-bridge", "connect-services"),
    ).toBe(false);
    expect(
      isGuidedDisplayStepAllowed("choose-target-repos", "local-setup"),
    ).toBe(true);
    expect(
      isGuidedDisplayStepAllowed("cloud-secrets", "local-readiness"),
    ).toBe(false);
  });

  it("orders guided display steps for comparison", () => {
    expect(
      compareGuidedDisplaySteps("connect-services", "linear-workspace"),
    ).toBeLessThan(0);
    expect(
      compareGuidedDisplaySteps("target-workflow", "cloud-secrets"),
    ).toBeGreaterThan(0);
  });

  it("detects readiness forward advancement only", () => {
    expect(
      readinessStepAdvanced("linear-workspace", "connect-services"),
    ).toBe(true);
    expect(
      readinessStepAdvanced("connect-services", "linear-workspace"),
    ).toBe(false);
  });

  it("detects when local setup files already exist", () => {
    expect(
      localSetupFilesExist(
        summary({
          overview: {
            configResolved: true,
            operatorConfigResolved: true,
            readyForLocalDoctor: true,
            localFilesPresent: true,
          },
        }),
      ),
    ).toBe(true);
  });

  it("advances guided display after connect services and local apply", () => {
    expect(GUIDED_DISPLAY_STEP_AFTER_CONNECT_SERVICES).toBe("linear-workspace");
    expect(GUIDED_DISPLAY_STEP_AFTER_LOCAL_APPLY).toBe("local-readiness");
    expect(GUIDED_DISPLAY_STEP_AFTER_WORKFLOW_READY).toBe("ready-for-first-run");
  });

  it("allows navigating back to earlier guided steps", () => {
    expect(
      clampGuidedDisplayStep({
        target: "connect-services",
        currentStepId: "local-readiness",
      }),
    ).toBe("connect-services");
  });
});
