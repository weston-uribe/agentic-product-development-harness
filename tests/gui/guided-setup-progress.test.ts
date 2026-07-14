import { describe, expect, it } from "vitest";
import {
  deriveGuidedProgressStages,
  firstRunStepIdForProgressStage,
  GUIDED_PROGRESS_STAGES,
  GUIDED_SETUP_STEP_COUNT,
  progressStageForDisplayStep,
  progressStageForFirstRunStepId,
} from "../../apps/gui/lib/guided-setup";
import type { FirstRunStep } from "../../src/setup/first-run-readiness";

function readinessStep(
  id: FirstRunStep["id"],
  status: FirstRunStep["status"],
): FirstRunStep {
  return {
    id,
    label: id,
    status,
    summary: "",
    blockers: [],
    warnings: [],
    inspectable: true,
    actionable: true,
  };
}

function buildReadinessSteps(
  currentStepId: FirstRunStep["id"],
): FirstRunStep[] {
  const order: FirstRunStep["id"][] = [
    "connect-services",
    "linear-workspace",
    "vercel-bridge",
    "local-setup",
    "local-readiness",
    "cloud-secrets",
    "target-workflow",
    "ready-for-first-run",
  ];
  const currentIndex = order.indexOf(currentStepId);

  return order.map((id, index) =>
    readinessStep(
      id,
      index < currentIndex ? "complete" : index === currentIndex ? "in_progress" : "not_started",
    ),
  );
}

describe("guided setup progress metadata", () => {
  it("defines exactly seven progress stages in display order", () => {
    expect(GUIDED_SETUP_STEP_COUNT).toBe(7);
    expect(GUIDED_PROGRESS_STAGES).toHaveLength(7);
    expect(GUIDED_PROGRESS_STAGES.map((stage) => stage.id)).toEqual([
      "connect-services",
      "linear-workspace",
      "vercel-bridge",
      "choose-target-repos",
      "local-readiness",
      "cloud-secrets",
      "target-workflow",
    ]);
  });

  it("centralizes first-run to progress stage mapping", () => {
    expect(firstRunStepIdForProgressStage("choose-target-repos")).toBe(
      "local-setup",
    );
    expect(progressStageForFirstRunStepId("local-setup")).toBe(
      "choose-target-repos",
    );
    expect(progressStageForDisplayStep("ready-for-first-run")).toBeNull();
  });
});

describe("deriveGuidedProgressStages", () => {
  it("marks the displayed step current on step 1", () => {
    const stages = deriveGuidedProgressStages({
      displayedStep: "connect-services",
      readinessCurrentStepId: "connect-services",
      readinessSteps: buildReadinessSteps("connect-services"),
      readyForFirstRun: false,
    });

    expect(stages.find((stage) => stage.id === "connect-services")?.state).toBe(
      "current",
    );
    expect(stages.filter((stage) => stage.state === "completed")).toHaveLength(
      0,
    );
  });

  it("marks all seven stages complete when ready for first run", () => {
    const stages = deriveGuidedProgressStages({
      displayedStep: "ready-for-first-run",
      readinessCurrentStepId: "ready-for-first-run",
      readinessSteps: buildReadinessSteps("ready-for-first-run"),
      readyForFirstRun: true,
    });

    expect(stages).toHaveLength(7);
    expect(stages.every((stage) => stage.state === "completed")).toBe(true);
    expect(stages.some((stage) => stage.state === "current")).toBe(false);
  });

  it("keeps objectively completed later stages complete when navigating back", () => {
    const stages = deriveGuidedProgressStages({
      displayedStep: "linear-workspace",
      readinessCurrentStepId: "local-readiness",
      readinessSteps: buildReadinessSteps("local-readiness"),
      readyForFirstRun: false,
    });

    expect(stages.find((stage) => stage.id === "linear-workspace")?.state).toBe(
      "current",
    );
    expect(stages.find((stage) => stage.id === "connect-services")?.state).toBe(
      "completed",
    );
    expect(stages.find((stage) => stage.id === "vercel-bridge")?.state).toBe(
      "completed",
    );
    expect(stages.find((stage) => stage.id === "choose-target-repos")?.state).toBe(
      "completed",
    );
    expect(stages.find((stage) => stage.id === "local-readiness")?.state).toBe(
      "upcoming",
    );
  });

  it("marks repositories current while preserving readiness through step 7", () => {
    const stages = deriveGuidedProgressStages({
      displayedStep: "choose-target-repos",
      readinessCurrentStepId: "target-workflow",
      readinessSteps: buildReadinessSteps("target-workflow"),
      readyForFirstRun: false,
    });

    expect(stages.find((stage) => stage.id === "choose-target-repos")?.state).toBe(
      "current",
    );
    expect(stages.find((stage) => stage.id === "cloud-secrets")?.state).toBe(
      "completed",
    );
    expect(stages.find((stage) => stage.id === "target-workflow")?.state).toBe(
      "upcoming",
    );
  });
});
