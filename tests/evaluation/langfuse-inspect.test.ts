import { describe, expect, it } from "vitest";
import { buildInspectReport } from "../../src/evaluation/langfuse-inspect/report.js";
import { deriveSessionId } from "../../src/evaluation/identifiers.js";

describe("langfuse inspect report", () => {
  it("fails acceptance when planning trace and planner agent are missing", () => {
    const sessionId = deriveSessionId("weston-dogfood", "FRE-3");
    const report = buildInspectReport({
      issueKey: "FRE-3",
      namespace: "weston-dogfood",
      sessionId,
      session: { id: sessionId },
      traces: [
        {
          id: "t1",
          name: "p-dev.implementation",
          metadata: { phase: "implementation" },
          observations: [],
        },
      ],
      observations: [],
      scores: [],
    });
    expect(report.acceptance.hasPlanningTrace).toBe(false);
    expect(report.acceptance.hasPlannerAgent).toBe(false);
    expect(report.acceptance.complete).toBe(false);
    expect(report.gaps.some((g) => g.code === "missing_planning_trace")).toBe(
      true,
    );
    // Legacy p-dev.* names are warnings; human-readable contract gaps are errors.
    expect(
      report.gaps.some(
        (g) =>
          g.code === "missing_visible_issue_key" && g.severity === "warning",
      ),
    ).toBe(true);
  });

  it("passes planner gates when human-readable planning entities exist", () => {
    const sessionId = deriveSessionId("weston-dogfood", "FRE-3");
    const report = buildInspectReport({
      issueKey: "FRE-3",
      namespace: "weston-dogfood",
      sessionId,
      session: { id: sessionId, name: "FRE-3" },
      traces: [
        {
          id: "plan",
          name: "FRE-3 · planning",
          metadata: {
            linearIssueKey: "FRE-3",
            phase: "planning",
            harnessRunId: "run-plan",
            phaseExecutionId: "pe-plan",
          },
          observations: [
            {
              id: "planner",
              name: "FRE-3 · planner",
              type: "AGENT",
              metadata: { linearIssueKey: "FRE-3", phase: "planning" },
            },
            {
              id: "gen",
              name: "FRE-3 · planner · Cursor run",
              type: "GENERATION",
              model: "composer-2.5",
              usageDetails: { input: 10, output: 5 },
              metadata: {
                linearIssueKey: "FRE-3",
                costSource: "unavailable",
                costUnavailableReason: "missing_pricing_entry",
              },
            },
          ],
        },
      ],
      observations: [],
      scores: [
        {
          id: "s1",
          name: "phase_success",
          traceId: "plan",
          value: true,
        },
      ],
    });
    expect(report.acceptance.hasPlanningTrace).toBe(true);
    expect(report.acceptance.hasPlannerAgent).toBe(true);
    expect(report.acceptance.missingVisibleIssueKey).toBe(false);
    expect(
      report.gaps.some((g) => g.code === "incomplete_cost_record"),
    ).toBe(false);
  });

  it("flags incomplete cost when costSource=unavailable without reason", () => {
    const sessionId = deriveSessionId("weston-dogfood", "FRE-3");
    const report = buildInspectReport({
      issueKey: "FRE-3",
      namespace: "weston-dogfood",
      sessionId,
      session: null,
      traces: [
        {
          id: "plan",
          name: "FRE-3 · planning",
          metadata: { linearIssueKey: "FRE-3", phase: "planning" },
          observations: [
            {
              id: "gen",
              name: "FRE-3 · planner · Cursor run",
              type: "GENERATION",
              metadata: {
                linearIssueKey: "FRE-3",
                costSource: "unavailable",
              },
            },
            {
              id: "planner",
              name: "FRE-3 · planner",
              type: "AGENT",
              metadata: { linearIssueKey: "FRE-3" },
            },
          ],
        },
      ],
      observations: [],
      scores: [],
    });
    expect(report.gaps.some((g) => g.code === "incomplete_cost_record")).toBe(
      true,
    );
  });

  it("fails when reprojected observation claims skills without artifact evidence", () => {
    const sessionId = deriveSessionId("weston-dogfood", "FRE-3");
    const report = buildInspectReport({
      issueKey: "FRE-3",
      namespace: "weston-dogfood",
      sessionId,
      session: { id: sessionId, name: "FRE-3" },
      traces: [
        {
          id: "plan",
          name: "FRE-3 · planning",
          metadata: {
            linearIssueKey: "FRE-3",
            phase: "planning",
            harnessRunId: "run-plan",
          },
          observations: [
            {
              id: "planner",
              name: "FRE-3 · planner",
              type: "AGENT",
              metadata: {
                linearIssueKey: "FRE-3",
                reprojected: true,
                harnessRunId: "run-plan",
                skillsUsed: [{ skillId: "planner" }],
                skillProvenanceStatus: "present",
                inclusionMethod: "rendered_into_prompt",
              },
            },
            {
              id: "gen",
              name: "FRE-3 · planner · Cursor run",
              type: "GENERATION",
              metadata: {
                linearIssueKey: "FRE-3",
                reprojected: true,
                harnessRunId: "run-plan",
                costSource: "unavailable",
                costUnavailableReason: "missing_pricing_entry",
                skillsUsed: [],
                skillProvenanceStatus: "none",
              },
            },
          ],
        },
      ],
      observations: [],
      scores: [],
      artifactRuns: [
        {
          runId: "run-plan",
          phase: "planning",
          sessionId,
          traceId: null,
          skillIds: [],
          skillProvenanceStatus: "none",
        },
      ],
    });
    expect(
      report.gaps.some((g) => g.code === "false_skill_provenance"),
    ).toBe(true);
    expect(report.acceptance.complete).toBe(false);
  });

  it("accepts honest historical skillProvenanceStatus=none on reprojected observations", () => {
    const sessionId = deriveSessionId("weston-dogfood", "FRE-3");
    const report = buildInspectReport({
      issueKey: "FRE-3",
      namespace: "weston-dogfood",
      sessionId,
      session: { id: sessionId, name: "FRE-3" },
      traces: [
        {
          id: "plan",
          name: "FRE-3 · planning",
          metadata: {
            linearIssueKey: "FRE-3",
            phase: "planning",
            harnessRunId: "run-plan",
          },
          observations: [
            {
              id: "planner",
              name: "FRE-3 · planner",
              type: "AGENT",
              metadata: {
                linearIssueKey: "FRE-3",
                reprojected: true,
                harnessRunId: "run-plan",
                skillsUsed: [],
                skillProvenanceStatus: "none",
              },
            },
            {
              id: "gen",
              name: "FRE-3 · planner · Cursor run",
              type: "GENERATION",
              metadata: {
                linearIssueKey: "FRE-3",
                reprojected: true,
                harnessRunId: "run-plan",
                costSource: "unavailable",
                costUnavailableReason: "missing_pricing_entry",
                skillsUsed: [],
                skillProvenanceStatus: "none",
              },
            },
          ],
        },
      ],
      observations: [],
      scores: [],
      artifactRuns: [
        {
          runId: "run-plan",
          phase: "planning",
          sessionId,
          traceId: null,
          skillIds: [],
          skillProvenanceStatus: "none",
        },
      ],
    });
    expect(
      report.gaps.some((g) => g.code === "false_skill_provenance"),
    ).toBe(false);
    expect(report.acceptance.complete).toBe(true);
  });
});
