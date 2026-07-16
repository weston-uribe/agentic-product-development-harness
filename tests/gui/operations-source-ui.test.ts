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

  it("includes phase model and parameter controls in workflow cards", () => {
    const workflowCards = read("apps/gui/components/operations/workflow-cards-section.tsx");
    expect(workflowCards).toContain("Draft model (not active)");
    expect(workflowCards).toContain("<span>Model</span>");
    expect(workflowCards).toContain("supportedParameters");
    expect(workflowCards).toContain('role="switch"');
    expect(workflowCards).toContain("onSelectModel");
    expect(workflowCards).toContain("onUpdateModelParameter");
  });

  it("uses production-facing sidebar sections instead of prototype disclosures", () => {
    expect(read("apps/gui/components/operations/operations-sidebar.tsx")).toContain(
      "OperationsScopeSelector",
    );
    expect(read("apps/gui/components/operations/operations-sidebar.tsx")).toContain(
      "OperationsIssuesPanel",
    );
    expect(read("apps/gui/components/operations/workflow-cards-section.tsx")).not.toContain(
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
