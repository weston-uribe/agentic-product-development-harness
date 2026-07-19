import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reconcileWorkflowPath = path.join(
  repoRoot,
  ".github/workflows/harness-reconcile-revisions.yml",
);
const inspectWorkflowPath = path.join(
  repoRoot,
  ".github/workflows/evaluation-inspect-langfuse.yml",
);

describe("harness reconcile revisions workflow", () => {
  const workflow = readFileSync(reconcileWorkflowPath, "utf8");

  it("uses generic reconcile-workflow command instead of FRE-3 seed", () => {
    expect(workflow).toContain("harness:reconcile-workflow");
    expect(workflow).not.toContain("FRE-3");
    expect(workflow).not.toContain("harness:reconcile-revision");
    expect(workflow).not.toContain("harness:reconcile-merge");
  });

  it("loads managed GitHub workflow state during reconciliation", () => {
    expect(workflow).toContain("P_DEV_WORKFLOW_STATE_STORE_MODE: managed_github");
  });
});

describe("evaluation inspect langfuse workflow", () => {
  const workflow = readFileSync(inspectWorkflowPath, "utf8");

  it("does not silently ignore inspect CLI failures", () => {
    expect(workflow).not.toMatch(/evaluation:inspect-langfuse[^\n]*\|\| true/);
    expect(workflow).not.toMatch(/evaluation:reproject-langfuse[^\n]*\|\| true/);
    const inspectStep =
      workflow.match(
        /- name: Run Langfuse inspect[\s\S]*?(?=\n      - name:)/,
      )?.[0] ?? "";
    const postInspectStep =
      workflow.match(
        /- name: Run Langfuse reproject apply \+ post inspect[\s\S]*?(?=\n      - name:)/,
      )?.[0] ?? "";
    expect(inspectStep).not.toContain("|| true");
    expect(postInspectStep).not.toContain("|| true");
  });

  it("asserts inspect acceptance explicitly", () => {
    expect(workflow).toContain("Assert Langfuse inspect acceptance");
    expect(workflow).toContain("acceptance.complete");
    expect(workflow).toContain("Malformed Langfuse inspect report JSON");
  });

  it("always uploads redacted reports", () => {
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("Upload redacted report");
  });
});
