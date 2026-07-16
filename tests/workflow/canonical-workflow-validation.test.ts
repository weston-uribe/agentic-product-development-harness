import { describe, expect, it } from "vitest";
import {
  detectNoncanonicalConfigOverrides,
  validateCanonicalLinearWorkflow,
} from "../../src/workflow/canonical-workflow-validation.js";
import type { HarnessConfig } from "../../src/config/types.js";

function buildValidLinearStates() {
  return [
    { id: "s-backlog", name: "Backlog", category: "backlog" },
    { id: "s-rfp", name: "Ready for Planning", category: "unstarted" },
    { id: "s-planning", name: "Planning", category: "started" },
    { id: "s-rfb", name: "Ready for Build", category: "unstarted" },
    { id: "s-building", name: "Building", category: "started" },
    { id: "s-pr", name: "PR Open", category: "started" },
    { id: "s-pm", name: "PM Review", category: "started" },
    { id: "s-eng", name: "Engineering Review", category: "started" },
    { id: "s-rev", name: "Needs Revision", category: "unstarted" },
    { id: "s-revising", name: "Revising", category: "started" },
    { id: "s-rtm", name: "Ready to Merge", category: "started" },
    { id: "s-merging", name: "Merging", category: "started" },
    { id: "s-mtd", name: "Merged to Dev", category: "completed" },
    { id: "s-deployed", name: "Merged / Deployed", category: "completed" },
    { id: "s-blocked", name: "Blocked", category: "started" },
    { id: "s-canceled", name: "Canceled", category: "canceled" },
  ];
}

describe("canonical workflow validation", () => {
  it("passes when all required statuses match exact name and category", () => {
    const result = validateCanonicalLinearWorkflow({
      workflowStates: buildValidLinearStates(),
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.resolvedStatuses["ready-for-build"]?.id).toBe("s-rfb");
  });

  it("does not fail when Duplicate is absent", () => {
    const result = validateCanonicalLinearWorkflow({
      workflowStates: buildValidLinearStates(),
    });
    expect(result.valid).toBe(true);
    expect(result.resolvedStatuses.duplicate).toBeUndefined();
  });

  it("validates Duplicate when present with correct category", () => {
    const result = validateCanonicalLinearWorkflow({
      workflowStates: [
        ...buildValidLinearStates(),
        { id: "s-dup", name: "Duplicate", category: "canceled" },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.resolvedStatuses.duplicate?.id).toBe("s-dup");
  });

  it("reports missing, wrong-category, and duplicate-name violations together", () => {
    const result = validateCanonicalLinearWorkflow({
      workflowStates: [
        ...buildValidLinearStates().filter((state) => state.name !== "Blocked"),
        { id: "s-wrong", name: "Ready for Build", category: "started" },
        { id: "s-dup-a", name: "Planning", category: "started" },
        { id: "s-dup-b", name: "Planning", category: "started" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === "missing-status")).toBe(true);
    expect(
      result.violations.some(
        (v) => v.kind === "wrong-category" || v.kind === "name-mismatch",
      ),
    ).toBe(true);
    expect(result.violations.some((v) => v.kind === "duplicate-name")).toBe(true);
  });

  it("recovers by exact name/category after delete/recreate without stale ID blocking", () => {
    const recreated = validateCanonicalLinearWorkflow({
      workflowStates: buildValidLinearStates().map((state) =>
        state.name === "Planning"
          ? { id: "s-planning-new", name: "Planning", category: "started" }
          : state,
      ),
    });
    expect(recreated.valid).toBe(true);
    expect(recreated.resolvedStatuses.planning?.id).toBe("s-planning-new");
  });

  it("reports noncanonical configured status-name overrides", () => {
    const config = {
      linear: {
        eligibleStatuses: {
          planning: ["Plan Ready"],
        },
        transitionalStatuses: {
          pmReview: "Product Review",
        },
      },
    } as HarnessConfig;

    const overrides = detectNoncanonicalConfigOverrides(config);
    expect(overrides).toHaveLength(2);
    expect(overrides[0]?.path).toBe("linear.eligibleStatuses.planning");
    expect(overrides[1]?.path).toBe("linear.transitionalStatuses.pmReview");

    const result = validateCanonicalLinearWorkflow({
      workflowStates: buildValidLinearStates(),
      config,
    });
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((v) => v.kind === "noncanonical-config-override"),
    ).toBe(true);
  });

  it("ignores extra noncanonical Linear statuses", () => {
    const result = validateCanonicalLinearWorkflow({
      workflowStates: [
        ...buildValidLinearStates(),
        { id: "s-extra", name: "Icebox", category: "backlog" },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("flags deprecated Plan Review when present", () => {
    const result = validateCanonicalLinearWorkflow({
      workflowStates: [
        ...buildValidLinearStates(),
        { id: "s-pr-review", name: "Plan Review", category: "started" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === "deprecated-status-present")).toBe(
      true,
    );
  });
});
