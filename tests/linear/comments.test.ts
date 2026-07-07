import { describe, expect, it } from "vitest";
import {
  formatHarnessCommentFooter,
  formatPlanningComment,
  hasPlanningCompletionMarker,
} from "../../src/linear/comments.js";

describe("linear comments", () => {
  it("formats harness comment footer with required marker fields", () => {
    const footer = formatHarnessCommentFooter({
      orchestratorMarker: "harness-orchestrator-v1",
      phase: "planning",
      runId: "2026-07-06T20-30-00Z-WES-11",
      cursorAgentId: "agent-123",
      cursorRunId: "run-456",
      model: "composer-2.5",
      promptVersion: "planning@1",
      targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
    });

    expect(footer).toContain("harness-orchestrator-v1");
    expect(footer).toContain("phase: planning");
    expect(footer).toContain("run_id: 2026-07-06T20-30-00Z-WES-11");
    expect(footer).toContain("cursor_agent_id: agent-123");
    expect(footer).toContain("cursor_run_id: run-456");
    expect(footer).toContain("model: composer-2.5");
    expect(footer).toContain("prompt_version: planning@1");
    expect(footer).toContain(
      "target_repo: https://github.com/weston-uribe/weston-uribe-portfolio",
    );
  });

  it("wraps planning body with header and footer", () => {
    const body = formatPlanningComment("Step 1: inspect repo", {
      orchestratorMarker: "harness-orchestrator-v1",
      phase: "planning",
      runId: "run-1",
      model: "composer-2.5",
      promptVersion: "planning@1",
      targetRepo: "https://github.com/example/repo",
    });

    expect(body).toContain("## Implementation plan");
    expect(body).toContain("Step 1: inspect repo");
    expect(body).toContain("phase: planning");
  });

  it("detects planning completion marker in comment body", () => {
    const comment = formatPlanningComment("Plan content", {
      orchestratorMarker: "harness-orchestrator-v1",
      phase: "planning",
      runId: "run-abc",
      model: "composer-2.5",
      promptVersion: "planning@1",
      targetRepo: "https://github.com/example/repo",
    });

    expect(
      hasPlanningCompletionMarker(comment, "harness-orchestrator-v1"),
    ).toBe(true);
    expect(hasPlanningCompletionMarker("no markers here", "harness-orchestrator-v1")).toBe(
      false,
    );
  });
});
