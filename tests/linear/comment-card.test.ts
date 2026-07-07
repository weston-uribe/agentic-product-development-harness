import { describe, expect, it } from "vitest";
import { buildHarnessComment } from "../../src/linear/comment-card.js";

describe("buildHarnessComment", () => {
  it("renders PM-first sections with global harness header", () => {
    const body = buildHarnessComment({
      phaseLabel: "PM handoff",
      pmSection: [
        "Please review the preview.",
        "",
        "- [Pull request](https://github.com/o/r/pull/1)",
      ],
      engineerSection: ["- Harness run ID: run-1"],
      footer: "---\nharness-orchestrator-v1\nphase: test\n---",
    });

    expect(body.startsWith("# Comment from harness")).toBe(true);
    expect(body).toContain("**Phase:** PM handoff");
    expect(body.indexOf("## For the PM")).toBeLessThan(
      body.indexOf("## For the engineer"),
    );
    expect(body).toContain("[Pull request](https://github.com/o/r/pull/1)");
    expect(body).toContain("harness-orchestrator-v1");
    expect(body).not.toContain("What you need to know");
    expect(body).not.toContain("Next actions");
    expect(body).not.toContain("🤖 Harness update");
  });

  it("does not include legacy warning section heading", () => {
    const body = buildHarnessComment({
      phaseLabel: "Building",
      pmSection: ["Build has started.", "Preview URL not found yet."],
      footer: "---\nmarker\n---",
    });

    expect(body).not.toContain("### Warning");
    expect(body).toContain("Preview URL not found yet.");
  });
});
