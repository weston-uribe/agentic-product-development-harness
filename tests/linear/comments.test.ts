import { describe, expect, it } from "vitest";
import {
  formatHarnessCommentFooter,
  formatPhaseStartComment,
  formatPlanningComment,
  findPhaseStartMarker,
  hasPlanningCompletionMarker,
  hasPhaseStartMarker,
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

    expect(body).toContain("🤖 Harness update");
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

  it("formats phase-start comment with GitHub Actions run URL", () => {
    const body = formatPhaseStartComment(
      "implementation_start",
      {
        issueKey: "WES-18",
        targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
        branch: "cursor/wes-18-test",
        githubActionsRunUrl:
          "https://github.com/weston-uribe/agentic-product-development-harness/actions/runs/123",
        cursorAgentId: "bc-agent",
        cursorRunId: "run-abc",
      },
      {
        orchestratorMarker: "harness-orchestrator-v1",
        runId: "2026-07-07T21-00-00Z-WES-18",
        model: "composer-2.5",
        promptVersion: "implementation@1",
        targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
        branch: "cursor/wes-18-test",
        githubActionsRunUrl:
          "https://github.com/weston-uribe/agentic-product-development-harness/actions/runs/123",
        cursorAgentId: "bc-agent",
        cursorRunId: "run-abc",
      },
    );

    expect(body).toContain("🤖 Harness update — Building");
    expect(body).toContain("Issue: WES-18");
    expect(body).toContain("phase: implementation_start");
    expect(body).toContain(
      "github_actions_run_url: https://github.com/weston-uribe/agentic-product-development-harness/actions/runs/123",
    );
    expect(body).toContain("cursor_agent_id: bc-agent");
  });

  it("detects duplicate phase-start markers by run id", () => {
    const comment = formatPhaseStartComment(
      "merge_start",
      {
        issueKey: "WES-18",
        targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
        prUrl: "https://github.com/weston-uribe/weston-uribe-portfolio/pull/7",
      },
      {
        orchestratorMarker: "harness-orchestrator-v1",
        runId: "run-merge-1",
        model: "composer-2.5",
        promptVersion: "merge@1",
        targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
        prUrl: "https://github.com/weston-uribe/weston-uribe-portfolio/pull/7",
      },
    );

    expect(
      hasPhaseStartMarker(comment, "harness-orchestrator-v1", "merge_start", "run-merge-1"),
    ).toBe(true);
    expect(
      findPhaseStartMarker(
        [{ body: comment }],
        "harness-orchestrator-v1",
        "merge_start",
        "run-merge-1",
      ),
    ).toBe(true);
    expect(
      hasPhaseStartMarker(comment, "harness-orchestrator-v1", "merge_start", "other-run"),
    ).toBe(false);
  });
});
