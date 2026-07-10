import { describe, expect, it } from "vitest";
import {
  compareGuidedDisplaySteps,
  clampGuidedDisplayStep,
  defaultGuidedDisplayStep,
  getPreviousGuidedDisplayStep,
  GUIDED_DISPLAY_STEP_AFTER_LOCAL_APPLY,
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
      GITHUB_DISPATCH_REPOSITORY: false,
    },
    localFiles: [],
    ...partial,
  } as SetupGuiViewModel;
}

describe("guided-setup navigation", () => {
  it("maps each guided step to the previous step", () => {
    expect(getPreviousGuidedDisplayStep("connect-services")).toBeNull();
    expect(getPreviousGuidedDisplayStep("choose-target-repos")).toBe(
      "connect-services",
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

  it("shows Back only on Step 2 through completion", () => {
    expect(shouldShowGuidedBackButton("connect-services")).toBe(false);
    expect(shouldShowGuidedBackButton("choose-target-repos")).toBe(true);
    expect(shouldShowGuidedBackButton("local-readiness")).toBe(true);
    expect(shouldShowGuidedBackButton("cloud-secrets")).toBe(true);
    expect(shouldShowGuidedBackButton("target-workflow")).toBe(true);
    expect(shouldShowGuidedBackButton("ready-for-first-run")).toBe(true);
  });

  it("defaults fresh mount to readiness current step", () => {
    expect(
      defaultGuidedDisplayStep({
        currentStepId: "local-readiness",
        summary: summary({}),
      }),
    ).toBe("local-readiness");

    expect(
      defaultGuidedDisplayStep({
        currentStepId: "cloud-secrets",
        summary: summary({}),
      }),
    ).toBe("cloud-secrets");
  });

  it("defaults local-setup to Step 1 until service keys exist in saved env", () => {
    expect(
      defaultGuidedDisplayStep({
        currentStepId: "local-setup",
        summary: summary({}),
      }),
    ).toBe("connect-services");

    expect(
      defaultGuidedDisplayStep({
        currentStepId: "local-setup",
        summary: summary({
          localFiles: [{ label: ".env.local", exists: true, path: ".env.local" }],
          envKeyPresence: {
            HARNESS_CONFIG_PATH: true,
            LINEAR_API_KEY: true,
            CURSOR_API_KEY: true,
            GITHUB_TOKEN: true,
            GITHUB_DISPATCH_REPOSITORY: false,
          },
        }),
      }),
    ).toBe("choose-target-repos");
  });

  it("does not allow navigating forward past readiness current step", () => {
    expect(
      isGuidedDisplayStepAllowed("local-readiness", "local-setup"),
    ).toBe(false);
    expect(
      isGuidedDisplayStepAllowed("choose-target-repos", "local-setup"),
    ).toBe(true);
    expect(
      isGuidedDisplayStepAllowed("cloud-secrets", "local-readiness"),
    ).toBe(false);
    expect(
      isGuidedDisplayStepAllowed("local-readiness", "local-readiness"),
    ).toBe(true);
  });

  it("orders guided display steps for comparison", () => {
    expect(
      compareGuidedDisplaySteps("connect-services", "choose-target-repos"),
    ).toBeLessThan(0);
    expect(
      compareGuidedDisplaySteps("target-workflow", "cloud-secrets"),
    ).toBeGreaterThan(0);
  });

  it("detects readiness forward advancement only", () => {
    expect(
      readinessStepAdvanced("local-readiness", "local-setup"),
    ).toBe(true);
    expect(
      readinessStepAdvanced("local-setup", "local-readiness"),
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
    expect(localSetupFilesExist(summary({ overview: { localFilesPresent: false } }))).toBe(
      false,
    );
  });

  it("advances guided display to local readiness after Step 2 apply", () => {
    expect(GUIDED_DISPLAY_STEP_AFTER_LOCAL_APPLY).toBe("local-readiness");
  });

  it("allows navigating back to earlier local setup sub-steps", () => {
    expect(
      clampGuidedDisplayStep({
        target: "connect-services",
        currentStepId: "local-readiness",
      }),
    ).toBe("connect-services");
  });
});
