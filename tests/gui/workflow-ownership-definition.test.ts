import { describe, expect, it } from "vitest";
import { WORKFLOW_OWNERSHIP_COLUMNS } from "../../apps/gui/lib/workflow/workflow-ownership.js";

describe("workflow ownership from shared definition", () => {
  it("preserves three columns without optional review cards", () => {
    expect(WORKFLOW_OWNERSHIP_COLUMNS.map((c) => c.id)).toEqual([
      "human",
      "harness",
      "agent",
    ]);
    const all = WORKFLOW_OWNERSHIP_COLUMNS.flatMap((c) => [...c.statuses]);
    expect(all).not.toContain("plan-review");
    expect(all).not.toContain("code-review");
    expect(all).toEqual(
      expect.arrayContaining([
        "backlog",
        "pm-review",
        "engineering-review",
        "planning",
        "building",
        "revising",
        "ready-for-planning",
        "ready-for-build",
        "pr-open",
        "needs-revision",
        "ready-to-merge",
        "merging",
      ]),
    );
  });

  it("keeps agent-owned statuses as planning/building/revising", () => {
    const agent = WORKFLOW_OWNERSHIP_COLUMNS.find((c) => c.id === "agent");
    expect(agent?.statuses).toEqual(["planning", "building", "revising"]);
  });
});
