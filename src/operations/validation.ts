import { detectNoncanonicalConfigOverrides } from "../workflow/canonical-workflow-validation.js";
import {
  CANONICAL_AGENT_PHASES,
  CANONICAL_WORKFLOW_FINGERPRINT,
} from "../workflow/canonical-product-development-workflow.js";
import { lookupModelInCatalog } from "./model-catalog-lookup.js";
import { findDuplicateNormalizedNames } from "./current-workflow.js";
import type { HarnessConfig } from "../config/types.js";
import type {
  OperationsBaseSnapshot,
  OperationsCatalogLoadMetadata,
  OperationsCurrentWorkflowMapping,
  OperationsModelCatalogEntry,
  OperationsStatusRecord,
  OperationsValidationIssue,
  OperationsValidationResult,
  OperationsWorkflowDraft,
} from "./types.js";
import type { CanonicalValidationResult } from "../workflow/canonical-workflow-validation.js";

export interface ValidationContext {
  draft: OperationsWorkflowDraft;
  statuses: OperationsStatusRecord[];
  modelCatalog: OperationsModelCatalogEntry[];
  currentWorkflowMappings: OperationsCurrentWorkflowMapping[];
  baseSnapshot?: OperationsBaseSnapshot;
  catalogLoadMetadata?: OperationsCatalogLoadMetadata;
  config?: HarnessConfig;
  canonicalValidation?: CanonicalValidationResult;
}

function issue(
  partial: Omit<OperationsValidationIssue, "severity"> & {
    severity?: OperationsValidationIssue["severity"];
  },
): OperationsValidationIssue {
  return {
    severity: partial.severity ?? "error",
    ...partial,
  };
}

export function validateOperationsDraft(
  context: ValidationContext,
): OperationsValidationResult {
  const errors: OperationsValidationIssue[] = [];
  const warnings: OperationsValidationIssue[] = [];
  const infos: OperationsValidationIssue[] = [];
  const { draft } = context;
  const modelCatalogLoaded =
    context.catalogLoadMetadata?.modelCatalog === "loaded";

  if (context.catalogLoadMetadata?.statusCatalog === "unavailable") {
    warnings.push(
      issue({
        id: "status-catalog-unavailable",
        severity: "warning",
        message:
          "Validation limitation: live Linear status catalog could not be loaded, so status reference checks are limited.",
      }),
    );
  }

  if (context.catalogLoadMetadata?.modelCatalog === "unavailable") {
    warnings.push(
      issue({
        id: "model-catalog-unavailable",
        severity: "warning",
        message:
          "Validation limitation: live Cursor model catalog could not be loaded, so model selection checks are limited.",
      }),
    );
  }

  if (draft.baseSnapshot.workflowFingerprint !== CANONICAL_WORKFLOW_FINGERPRINT) {
    warnings.push(
      issue({
        id: "stale-workflow-fingerprint",
        severity: "warning",
        message:
          "Draft workflow fingerprint differs from the canonical product-development workflow.",
      }),
    );
  }

  for (const normalized of findDuplicateNormalizedNames(
    context.statuses.map((status) => ({
      id: status.id,
      name: status.name,
      type: status.category,
    })),
  )) {
    errors.push(
      issue({
        id: "duplicate-normalized-status-name",
        message: `Multiple Linear statuses normalize to the same name: ${normalized}`,
      }),
    );
  }

  if (context.config) {
    for (const override of detectNoncanonicalConfigOverrides(context.config)) {
      errors.push(
        issue({
          id: "noncanonical-config-override",
          message: override.message,
          path: override.path,
        }),
      );
    }
  }

  if (context.canonicalValidation && !context.canonicalValidation.valid) {
    for (const violation of context.canonicalValidation.violations) {
      errors.push(
        issue({
          id: `canonical-${violation.kind}`,
          message: violation.message,
          canonicalStatusKey: violation.statusKey,
          path: violation.path,
        }),
      );
    }
  }

  if (context.canonicalValidation?.informationalWarnings.length) {
    for (const warning of context.canonicalValidation.informationalWarnings) {
      infos.push(
        issue({
          id: `canonical-${warning.kind}`,
          severity: "info",
          message: warning.message,
        }),
      );
    }
  }

  for (const phase of CANONICAL_AGENT_PHASES) {
    if (!phase.supportsModelConfiguration) {
      continue;
    }
    const selection = draft.phaseModelSettings[phase.key];
    if (!selection) {
      continue;
    }
    if (!modelCatalogLoaded) {
      continue;
    }
    const model = lookupModelInCatalog(context.modelCatalog, selection.modelId);
    if (!model || model.availability !== "available") {
      errors.push(
        issue({
          id: "invalid-phase-model",
          phaseKey: phase.key,
          message: `Draft model "${selection.modelId}" for ${phase.label} is unavailable in the current catalog.`,
        }),
      );
      continue;
    }
    for (const parameter of selection.parameters) {
      const definition = model.supportedParameters.find(
        (entry) => entry.id === parameter.id,
      );
      if (!definition) {
        errors.push(
          issue({
            id: "unsupported-model-parameter",
            phaseKey: phase.key,
            message: `Model parameter "${parameter.id}" is not supported for ${phase.label}.`,
          }),
        );
      }
    }
  }

  if (draft.metadata?.migrationNotice) {
    infos.push(
      issue({
        id: "draft-migration-notice",
        severity: "info",
        message: draft.metadata.migrationNotice,
      }),
    );
  }

  return { errors, warnings, infos };
}

export function deriveWorkflowHealthState(input: {
  catalogLoadMetadata?: OperationsCatalogLoadMetadata;
  validation: OperationsValidationResult;
  canonicalValidation?: CanonicalValidationResult;
}): "healthy" | "blocking-configuration-error" | "linear-unavailable" {
  if (input.catalogLoadMetadata?.statusCatalog === "unavailable") {
    return "linear-unavailable";
  }
  if (input.validation.errors.length > 0) {
    return "blocking-configuration-error";
  }
  if (input.canonicalValidation && !input.canonicalValidation.valid) {
    return "blocking-configuration-error";
  }
  return "healthy";
}
