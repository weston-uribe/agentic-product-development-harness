import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("operations source UI coverage", () => {
  it("renders compact draft notice without authoritative Apply action", () => {
    expect(
      read("apps/gui/components/operations/draft-mode-banner.tsx"),
    ).toContain("Draft — Changes are not active.");
    expect(
      read("apps/gui/components/operations/operations-toolbar.tsx"),
    ).not.toContain("Apply to harness");
  });

  it("includes rule, model, parameter, and outcome semantic controls", () => {
    const inspector = read("apps/gui/components/operations/rule-inspector.tsx");
    expect(inspector).toContain("Automation enabled");
    expect(inspector).toContain('label="Model"');
    expect(inspector).toContain("supportedParameters");
    expect(inspector).toContain('role="switch"');
    expect(inspector).toContain("Add outcome");
    expect(inspector).toContain("Outcome label");
    expect(inspector).toContain("Destination status");
    expect(inspector).toContain("Remove outcome");
  });

  it("uses production-facing sidebar sections instead of prototype disclosures", () => {
    expect(read("apps/gui/components/operations/operations-sidebar.tsx")).toContain(
      "OperationsScopeSelector",
    );
    expect(read("apps/gui/components/operations/operations-sidebar.tsx")).toContain(
      "OperationsIssuesPanel",
    );
    expect(read("apps/gui/components/operations/rule-inspector.tsx")).not.toContain(
      "Prototype only",
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
