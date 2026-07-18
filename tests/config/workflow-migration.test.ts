import { describe, expect, it } from "vitest";
import {
  migrateWorkflowConfigSection,
  migratedWorkflowPreservesCurrentBehavior,
} from "../../src/config/migrate-workflow-config.js";
import { harnessConfigSchema } from "../../src/config/schema.js";
import { resolveWorkflowDefinition } from "../../src/workflow/definition/index.js";
import { evaluateTransition } from "../../src/workflow/transition-engine.js";

const minimalConfig = {
  version: 1 as const,
  repos: [
    {
      id: "app",
      targetRepo: "https://github.com/example/app",
      baseBranch: "main",
      productionBranch: "main",
    },
  ],
  allowedTargetRepos: ["https://github.com/example/app"],
};

describe("workflow config migration", () => {
  it("fills defaults without enabling optional reviewers", () => {
    const migrated = migrateWorkflowConfigSection({});
    expect(migratedWorkflowPreservesCurrentBehavior(migrated)).toBe(true);
    expect(migrated.optionalPhases).toEqual({
      planReview: false,
      codeReview: false,
    });
  });

  it("accepts configs without workflow section", () => {
    const parsed = harnessConfigSchema.parse(minimalConfig);
    expect(parsed.workflow).toBeUndefined();
    const migrated = migrateWorkflowConfigSection(parsed);
    expect(migrated.schemaVersion).toContain("product-development");
  });

  it("preserves no-review routing after migration", () => {
    const migrated = migrateWorkflowConfigSection({});
    const definition = resolveWorkflowDefinition({
      workflowConfig: migrated,
      baseBranch: "dev",
      productionBranch: "main",
    });
    const planning = evaluateTransition({
      definition,
      currentPhaseId: "planning",
      cycleCounters: {},
      evidence: { linearStatusName: "Planning" },
      outcome: {
        kind: "success",
        phaseId: "planning",
        attemptIdentity: "m1",
      },
    });
    expect(planning.nextStatusName).toBe("Ready for Build");

    const handoff = evaluateTransition({
      definition,
      currentPhaseId: "handoff",
      cycleCounters: {},
      evidence: { linearStatusName: "PR Open" },
      outcome: {
        kind: "success",
        phaseId: "handoff",
        attemptIdentity: "m2",
      },
    });
    expect(handoff.nextStatusName).toBe("PM Review");
  });

  it("does not mutate source config object", () => {
    const source: Record<string, unknown> = { ...minimalConfig };
    const before = JSON.stringify(source);
    migrateWorkflowConfigSection(source);
    expect(JSON.stringify(source)).toBe(before);
  });
});
