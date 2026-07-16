import { describe, expect, it } from "vitest";
import { validateOperationsDraft } from "../../src/operations/validation.js";
import { CANONICAL_WORKFLOW_FINGERPRINT } from "../../src/workflow/canonical-product-development-workflow.js";
import type { HarnessConfig } from "../../src/config/types.js";

describe("operations validation", () => {
  const baseDraft = {
    schemaVersion: 2 as const,
    draftId: "draft-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    savedByRuntime: "source-gui" as const,
    sourceMode: "live" as const,
    baseSnapshot: {
      configFingerprint: "abc",
      statusCatalogFingerprint: "def",
      modelCatalogFingerprint: "ghi",
      workflowFingerprint: CANONICAL_WORKFLOW_FINGERPRINT,
    },
    layout: { statusPositions: {} },
    phaseModelSettings: {},
  };

  it("warns on stale workflow fingerprint", () => {
    const result = validateOperationsDraft({
      draft: {
        ...baseDraft,
        baseSnapshot: {
          ...baseDraft.baseSnapshot,
          workflowFingerprint: "legacy-fingerprint",
        },
      },
      statuses: [],
      modelCatalog: [],
      currentWorkflowMappings: [],
    });
    expect(result.warnings.some((issue) => issue.id === "stale-workflow-fingerprint")).toBe(
      true,
    );
  });

  it("reports invalid phase model when catalog metadata is loaded", () => {
    const result = validateOperationsDraft({
      draft: {
        ...baseDraft,
        phaseModelSettings: {
          planning: {
            modelId: "missing-model",
            displayNameAtSelection: "Missing",
            parameters: [],
          },
        },
      },
      statuses: [],
      modelCatalog: [],
      currentWorkflowMappings: [],
      catalogLoadMetadata: { statusCatalog: "loaded", modelCatalog: "loaded" },
    });
    expect(result.errors.some((issue) => issue.id === "invalid-phase-model")).toBe(true);
  });

  it("reports unsupported model parameters for configured phases", () => {
    const result = validateOperationsDraft({
      draft: {
        ...baseDraft,
        phaseModelSettings: {
          implementation: {
            modelId: "composer-2.5",
            displayNameAtSelection: "Composer 2.5",
            parameters: [{ id: "unsupported-param", value: "true" }],
          },
        },
      },
      statuses: [],
      modelCatalog: [
        {
          id: "composer-2.5",
          displayName: "Composer 2.5",
          availability: "available",
          supportedParameters: [
            {
              id: "fast",
              label: "Fast",
              type: "boolean",
              allowedValues: ["true", "false"],
            },
          ],
          source: "fixture",
        },
      ],
      currentWorkflowMappings: [],
      catalogLoadMetadata: { statusCatalog: "loaded", modelCatalog: "loaded" },
    });
    expect(result.errors.some((issue) => issue.id === "unsupported-model-parameter")).toBe(
      true,
    );
  });

  it("reports duplicate normalized status names", () => {
    const result = validateOperationsDraft({
      draft: baseDraft,
      statuses: [
        {
          id: "status-a",
          name: "Planning",
          category: "started",
          source: "fixture",
          participatesInCurrentHarnessWorkflow: true,
          automationTriggerStatus: false,
          currentMappingKeys: [],
          mappingState: "resolved",
        },
        {
          id: "status-b",
          name: " planning ",
          category: "started",
          source: "fixture",
          participatesInCurrentHarnessWorkflow: true,
          automationTriggerStatus: false,
          currentMappingKeys: [],
          mappingState: "resolved",
        },
      ],
      modelCatalog: [],
      currentWorkflowMappings: [],
    });
    expect(result.errors.some((issue) => issue.id === "duplicate-normalized-status-name")).toBe(
      true,
    );
  });

  it("reports noncanonical config overrides", () => {
    const config = {
      version: 1,
      orchestratorMarker: "harness-orchestrator-v1",
      logDirectory: "runs",
      repos: [],
      allowedTargetRepos: [],
      linear: {
        eligibleStatuses: {
          planning: ["Custom Planning Gate"],
        },
      },
    } as HarnessConfig;

    const result = validateOperationsDraft({
      draft: baseDraft,
      statuses: [],
      modelCatalog: [],
      currentWorkflowMappings: [],
      config,
    });
    expect(result.errors.some((issue) => issue.id === "noncanonical-config-override")).toBe(
      true,
    );
  });

  it("forwards canonical validation violations as errors", () => {
    const result = validateOperationsDraft({
      draft: baseDraft,
      statuses: [],
      modelCatalog: [],
      currentWorkflowMappings: [],
      canonicalValidation: {
        valid: false,
        violations: [
          {
            kind: "missing-status",
            message: 'Required status "Blocked" is missing.',
            statusKey: "blocked",
          },
        ],
        resolvedStatuses: {},
      },
    });
    expect(result.errors.some((issue) => issue.id === "canonical-missing-status")).toBe(true);
  });

  it("emits limitation warnings instead of false catalog errors when unavailable", () => {
    const result = validateOperationsDraft({
      draft: {
        ...baseDraft,
        phaseModelSettings: {
          planning: {
            modelId: "missing-model",
            displayNameAtSelection: "Missing",
            parameters: [],
          },
        },
      },
      statuses: [],
      modelCatalog: [
        {
          id: "catalog-unavailable",
          displayName: "Unavailable",
          availability: "catalog-unavailable",
          supportedParameters: [],
          source: "cursor-live",
        },
      ],
      currentWorkflowMappings: [],
      catalogLoadMetadata: { statusCatalog: "unavailable", modelCatalog: "unavailable" },
    });
    expect(result.errors.some((issue) => issue.id === "invalid-phase-model")).toBe(false);
    expect(result.warnings.some((issue) => issue.id === "status-catalog-unavailable")).toBe(true);
    expect(result.warnings.some((issue) => issue.id === "model-catalog-unavailable")).toBe(true);
  });

  it("surfaces migration notice as info", () => {
    const result = validateOperationsDraft({
      draft: {
        ...baseDraft,
        metadata: {
          migratedFromV1: true,
          migrationNotice: "Prototype workflow rules were discarded.",
        },
      },
      statuses: [],
      modelCatalog: [],
      currentWorkflowMappings: [],
    });
    expect(result.infos.some((issue) => issue.id === "draft-migration-notice")).toBe(true);
  });
});
