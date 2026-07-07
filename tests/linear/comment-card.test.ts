import { describe, expect, it } from "vitest";
import { buildHarnessComment } from "../../src/linear/comment-card.js";

describe("buildHarnessComment", () => {
  it("renders PM-first sections with links and footer", () => {
    const body = buildHarnessComment({
      header: "🤖 Harness update — Test",
      statusLine: "Status line.",
      links: [{ label: "Pull request", url: "https://github.com/o/r/pull/1" }],
      pmSection: ["Please review the preview."],
      engineerSection: ["- Harness run ID: run-1"],
      footer: "---\nharness-orchestrator-v1\nphase: test\n---",
    });

    expect(body.indexOf("### What you need to know")).toBeLessThan(
      body.indexOf("### Engineer details"),
    );
    expect(body).toContain("### Links");
    expect(body).toContain("[Pull request](https://github.com/o/r/pull/1)");
    expect(body).toContain("harness-orchestrator-v1");
  });

  it("includes warning section when provided", () => {
    const body = buildHarnessComment({
      header: "🤖 Harness update — Warning",
      statusLine: "Done.",
      warningSection: ["Preview URL not found yet."],
      footer: "---\nmarker\n---",
    });

    expect(body).toContain("### Warning");
    expect(body).toContain("Preview URL not found yet.");
  });
});
