import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RunManifest } from "../../src/types/run.js";

const mocks = vi.hoisted(() => ({
  executePlanningPhase: vi.fn(),
  executeImplementationPhase: vi.fn(),
}));

vi.mock("../../src/runner/phases/planning.js", () => ({
  executePlanningPhase: mocks.executePlanningPhase,
}));

vi.mock("../../src/runner/phases/implementation.js", () => ({
  executeImplementationPhase: mocks.executeImplementationPhase,
}));

import {
  runOrchestrator,
  shouldContinueToImplementationAfterPlanning,
} from "../../src/runner/orchestrator.js";

function baseManifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    runId: "run-1",
    issueKey: "WES-20",
    phase: "planning",
    phaseInferredFromStatus: "Ready for Planning",
    linearStatusBefore: "Ready for Planning",
    linearStatusAfter: "Ready for Build",
    targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
    baseBranch: "dev",
    resolutionSource: "linear_project",
    dryRun: false,
    finalOutcome: "success",
    errorClassification: null,
    startedAt: "2026-07-08T00:00:00.000Z",
    finishedAt: "2026-07-08T00:01:00.000Z",
    milestone: "m7",
    promptVersion: "planning@1",
    cursorAgentId: "agent-1",
    cursorRunId: "run-1",
    branch: null,
    prUrl: null,
    previewUrl: null,
    validationSummary: null,
    changedFiles: null,
    checkSummary: null,
    previousImplementationRunId: null,
    previousHandoffRunId: null,
    pmFeedbackCommentId: null,
    model: "composer-2.5",
    ...overrides,
  };
}

describe("shouldContinueToImplementationAfterPlanning", () => {
  it("continues only after successful planning", () => {
    expect(
      shouldContinueToImplementationAfterPlanning(
        baseManifest({ finalOutcome: "success" }),
      ),
    ).toBe(true);
    expect(
      shouldContinueToImplementationAfterPlanning(
        baseManifest({ finalOutcome: "duplicate" }),
      ),
    ).toBe(false);
    expect(
      shouldContinueToImplementationAfterPlanning(
        baseManifest({ finalOutcome: "failed" }),
      ),
    ).toBe(false);
  });
});

describe("runOrchestrator planning continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chains implementation after successful planning", async () => {
    const planningManifest = baseManifest({ finalOutcome: "success" });
    const implementationManifest = baseManifest({
      phase: "implementation",
      finalOutcome: "success",
      linearStatusBefore: "Ready for Build",
      linearStatusAfter: "Building",
    });

    mocks.executePlanningPhase.mockResolvedValue({
      exitCode: 0,
      runDirectory: "runs/WES-20/planning",
      manifest: planningManifest,
    });
    mocks.executeImplementationPhase.mockResolvedValue({
      exitCode: 0,
      runDirectory: "runs/WES-20/implementation",
      manifest: implementationManifest,
    });

    const result = await runOrchestrator({
      issueKey: "WES-20",
      configPath: "harness.config.json",
      phase: "planning",
    });

    expect(mocks.executePlanningPhase).toHaveBeenCalledOnce();
    expect(mocks.executeImplementationPhase).toHaveBeenCalledOnce();
    expect(result.manifest).toEqual(implementationManifest);
    expect(result.exitCode).toBe(0);
  });

  it("does not chain implementation after duplicate planning skip", async () => {
    mocks.executePlanningPhase.mockResolvedValue({
      exitCode: 0,
      runDirectory: "runs/WES-20/planning",
      manifest: baseManifest({
        finalOutcome: "duplicate",
        errorClassification: "duplicate_phase_completed",
      }),
    });

    const result = await runOrchestrator({
      issueKey: "WES-20",
      configPath: "harness.config.json",
      phase: "planning",
    });

    expect(mocks.executePlanningPhase).toHaveBeenCalledOnce();
    expect(mocks.executeImplementationPhase).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
  });

  it("does not chain implementation after failed planning", async () => {
    mocks.executePlanningPhase.mockResolvedValue({
      exitCode: 3,
      runDirectory: "runs/WES-20/planning",
      manifest: baseManifest({ finalOutcome: "failed" }),
    });

    const result = await runOrchestrator({
      issueKey: "WES-20",
      configPath: "harness.config.json",
      phase: "planning",
    });

    expect(mocks.executeImplementationPhase).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(3);
  });
});
