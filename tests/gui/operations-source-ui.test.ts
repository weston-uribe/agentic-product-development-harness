import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("operations source UI coverage", () => {
  it("renders draft-mode and no authoritative Apply claim", () => {
    expect(
      read("apps/gui/components/operations/draft-mode-banner.tsx"),
    ).toContain("Draft mode");
    expect(
      read("apps/gui/components/operations/operations-toolbar.tsx"),
    ).toContain("Apply to harness — coming later");
  });

  it("includes rule, model, parameter, and outcome semantic controls", () => {
    const inspector = read("apps/gui/components/operations/rule-inspector.tsx");
    expect(inspector).toContain("Rule enabled");
    expect(inspector).toContain("Draft model");
    expect(inspector).toContain("supportedParameters");
    expect(inspector).toContain("Add outcome");
    expect(inspector).toContain("Outcome label");
    expect(inspector).toContain("Destination status");
    expect(inspector).toContain("Remove outcome");
  });

  it("includes planned PR Review and fixture/source disclosures", () => {
    expect(read("apps/gui/components/operations/rule-inspector.tsx")).toContain(
      "Prototype only: no PR Review Agent exists",
    );
    expect(read("apps/gui/components/operations/available-status-panel.tsx")).toContain(
      "local draft-only",
    );
  });

  it("handles null bootstrap state without non-null draft assumptions", () => {
    const pageClient = read(
      "apps/gui/components/operations/operations-page-client.tsx",
    );
    expect(pageClient).toContain("Operations draft unavailable");
    expect(pageClient).not.toContain("bootstrap.draft!");
  });
});
