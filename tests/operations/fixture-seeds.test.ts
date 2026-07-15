import { describe, expect, it } from "vitest";
import { buildOperationsBootstrap, buildOperationsBaseSnapshot } from "../../src/operations/bootstrap.js";
import { getFixtureDefinition } from "../../src/operations/fixtures/index.js";
import { buildBranchingPrReviewSeed } from "../../src/operations/fixture-seeds/branching-pr-review.js";
import { buildBasicCurrentWorkflowSeed } from "../../src/operations/fixture-seeds/basic-current-workflow.js";
import {
  buildCurrentWorkflowMappings,
  buildWorkflowFingerprint,
  enrichStatusRecords,
} from "../../src/operations/current-workflow.js";
import { validateOperationsDraft } from "../../src/operations/validation.js";
import { getExecutorCatalog } from "../../src/operations/executor-catalog.js";
import { deleteDraft } from "../../src/operations/draft-store.js";
import { getFixtureWorkflowScopes } from "../../src/operations/fixtures/workflow-scopes.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("fixture seeds", () => {
  const fixtureScopes = getFixtureWorkflowScopes();
  const targetAppScope = fixtureScopes.find((scope) => scope.id === "target-app")!;
  const harnessRepoScope = fixtureScopes.find((scope) => scope.id === "harness-repo")!;

  it("builds a connected basic workflow with stable ids and outcomes", () => {
    const fixture = getFixtureDefinition("basic-current-workflow");
    const config = fixture.config;
    const mappings = buildCurrentWorkflowMappings({
      config: config ?? emptyConfig(),
      statuses: fixture.statuses,
      source: "fixture",
    });
    const statuses = enrichStatusRecords({
      config: config ?? emptyConfig(),
      statuses: fixture.statuses,
      source: "fixture",
    });
    const baseSnapshot = buildOperationsBaseSnapshot({
      statuses: fixture.statuses,
      modelCatalog: fixture.modelCatalog,
      mappingsFingerprint: buildWorkflowFingerprint(mappings),
    });
    const seed = buildBasicCurrentWorkflowSeed({
      context: { mode: "fixture", fixtureId: "basic-current-workflow", fixturesEnabled: true },
      scope: targetAppScope,
      baseSnapshot,
      statuses,
      modelCatalog: fixture.modelCatalog,
      mappings,
    });

    expect(seed.draftId).toBe("draft-fixture-basic-target-app");
    expect(seed.rules.every((rule) => rule.enabled && rule.outcomes.some((o) => o.enabled))).toBe(true);
    expect(seed.rules.find((rule) => rule.executorId === "planner-agent")?.outcomes).toHaveLength(2);
    expect(
      seed.rules.find((rule) => rule.id === "rule-fixture-pm-review")?.outcomes.find((o) => o.label === "Approved")
        ?.destinationStatusId,
    ).toBe("status-ready-merge");
  });

  it("builds branching fixture with one PR Review Agent rule and PM Review routing", () => {
    const fixture = getFixtureDefinition("branching-pr-review");
    const mappings = buildCurrentWorkflowMappings({
      config: emptyConfig(),
      statuses: fixture.statuses,
      source: "fixture",
    });
    const statuses = enrichStatusRecords({
      config: emptyConfig(),
      statuses: fixture.statuses,
      source: "fixture",
    });
    const baseSnapshot = buildOperationsBaseSnapshot({
      statuses: fixture.statuses,
      modelCatalog: fixture.modelCatalog,
      mappingsFingerprint: buildWorkflowFingerprint(mappings),
    });
    const seed = buildBranchingPrReviewSeed({
      context: { mode: "fixture", fixtureId: "branching-pr-review", fixturesEnabled: true },
      scope: harnessRepoScope,
      baseSnapshot,
      statuses,
      modelCatalog: fixture.modelCatalog,
      mappings,
    });

    const prReviewRules = seed.rules.filter((rule) => rule.executorId === "pr-review-agent");
    expect(prReviewRules).toHaveLength(1);
    expect(prReviewRules[0]?.sourceStatusId).toBe("status-eng-review");
    expect(prReviewRules[0]?.outcomes.map((o) => o.label).sort()).toEqual([
      "Approved",
      "Changes requested",
      "Unable to proceed",
    ]);
    expect(
      seed.rules.find((rule) => rule.id === "rule-fixture-pm-review")?.outcomes.find((o) => o.label === "Approved")
        ?.destinationStatusId,
    ).toBe("status-eng-review");
  });

  it("produces identical seeds across two fresh bootstraps and reset restores seed", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ops-fixture-seed-"));
    try {
      const context = {
        mode: "fixture" as const,
        fixtureId: "branching-pr-review",
        fixturesEnabled: true,
        scopeId: "harness-repo",
      };
      const first = await buildOperationsBootstrap({
        cwd,
        context,
        scopes: fixtureScopes,
        warnings: [],
      });
      const second = await buildOperationsBootstrap({
        cwd,
        context,
        scopes: fixtureScopes,
        warnings: [],
      });
      expect(JSON.stringify(first.draft)).toBe(JSON.stringify(second.draft));

      await deleteDraft(cwd, context, fixtureScopes);
      const afterReset = await buildOperationsBootstrap({
        cwd,
        context,
        scopes: fixtureScopes,
        warnings: [],
      });
      expect(JSON.stringify(afterReset.draft)).toBe(JSON.stringify(first.draft));

      const validation = validateOperationsDraft({
        draft: afterReset.draft!,
        statuses: afterReset.statuses,
        executors: getExecutorCatalog(),
        modelCatalog: afterReset.modelCatalog,
        currentWorkflowMappings: afterReset.currentWorkflowMappings,
        baseSnapshot: afterReset.draft!.baseSnapshot,
        catalogLoadMetadata: afterReset.catalogLoadMetadata,
      });
      expect(validation.errors.filter((e) => e.id === "enabled-rule-without-outcomes")).toHaveLength(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

function emptyConfig() {
  return {
    version: 1 as const,
    orchestratorMarker: "harness-orchestrator-v1",
    logDirectory: "runs",
    repos: [
      {
        id: "target-app",
        targetRepo: "https://github.com/owner/example-target-app",
        baseBranch: "main",
        productionBranch: "main",
      },
    ],
    allowedTargetRepos: ["https://github.com/owner/example-target-app"],
  };
}
