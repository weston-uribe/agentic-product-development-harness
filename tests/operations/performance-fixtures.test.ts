import { describe, expect, it } from "vitest";
import { getFixtureDefinition } from "../../src/operations/fixtures/index.js";
import { domainDraftToFlow } from "../../apps/gui/lib/operations/reducer.ts";
import { createCanonicalBaselineDraft } from "../../src/operations/draft-migration.js";
import { CANONICAL_STATUSES, CANONICAL_WORKFLOW_FINGERPRINT } from "../../src/workflow/canonical-product-development-workflow.js";
import type { OperationsBootstrapPayload } from "../../src/operations/types.js";

describe("operations performance fixtures", () => {
  it("generates canonical flow nodes quickly even with many extra Linear statuses", () => {
    const fixture = getFixtureDefinition("hundred-node-performance");
    const draft = createCanonicalBaselineDraft({
      baseSnapshot: {
        configFingerprint: "abc",
        statusCatalogFingerprint: "def",
        modelCatalogFingerprint: "ghi",
        workflowFingerprint: CANONICAL_WORKFLOW_FINGERPRINT,
      },
      sourceMode: "fixture",
      savedByRuntime: "fixture-test",
    });

    const bootstrap: OperationsBootstrapPayload = {
      sourceMode: "fixture",
      fixtureId: "hundred-node-performance",
      selectedScopeId: "target-app",
      scopes: [{ id: "target-app", targetRepo: "owner/example-target-app", baseBranch: "main", productionBranch: "main" }],
      dataSourceLabel: "Fixture",
      statuses: fixture.statuses.map((status) => ({
        id: status.id,
        name: status.name,
        category: status.type,
        source: "fixture" as const,
        participatesInCurrentHarnessWorkflow: false,
        automationTriggerStatus: false,
        currentMappingKeys: [],
        mappingState: "unmapped" as const,
      })),
      currentWorkflowMappings: [],
      currentModel: {
        providerId: "cursor",
        resolvedModelId: "composer-2.5",
        source: "code-default",
        pinnedParams: [],
        policyNote: "policy",
        draftOnlyNote: "draft only",
      },
      modelCatalog: fixture.modelCatalog,
      catalogLoadMetadata: {
        statusCatalog: "loaded",
        modelCatalog: "loaded",
      },
      draft,
      validation: { errors: [], warnings: [], infos: [] },
      canonicalWorkflow: {
        healthState: "healthy",
        violations: [],
        informationalWarnings: [],
        resolvedStatusIds: {},
        mergePathVariant: "direct-production",
      },
      warnings: fixture.warnings ?? [],
    };

    const started = performance.now();
    const flow = domainDraftToFlow({ draft, bootstrap });
    const elapsed = performance.now() - started;

    expect(flow.nodes).toHaveLength(CANONICAL_STATUSES.length);
    expect(flow.edges.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(250);
  });
});
