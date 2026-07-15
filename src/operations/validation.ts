import {
  isAssignableExecutorId,
  lookupExecutor,
} from "./executor-catalog.js";
import { findDuplicateNormalizedNames } from "./current-workflow.js";
import { lookupModelInCatalog } from "./model-catalog-lookup.js";
import type {
  OperationsBaseSnapshot,
  OperationsCurrentWorkflowMapping,
  OperationsExecutorCatalogEntry,
  OperationsModelCatalogEntry,
  OperationsStatusRecord,
  OperationsValidationIssue,
  OperationsValidationResult,
  OperationsWorkflowDraft,
} from "./types.js";

export interface ValidationContext {
  draft: OperationsWorkflowDraft;
  statuses: OperationsStatusRecord[];
  executors: OperationsExecutorCatalogEntry[];
  modelCatalog: OperationsModelCatalogEntry[];
  currentWorkflowMappings: OperationsCurrentWorkflowMapping[];
  baseSnapshot?: OperationsBaseSnapshot;
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
  const { draft, statuses } = context;
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const canvasIds = new Set(draft.statusIdsOnCanvas);

  for (const normalized of findDuplicateNormalizedNames(
    statuses.map((status) => ({
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

  for (const mapping of context.currentWorkflowMappings) {
    if (mapping.state === "ambiguous") {
      errors.push(
        issue({
          id: "ambiguous-config-mapping",
          message: `Configured status "${mapping.configuredStatusName}" (${mapping.mappingKey}) matches multiple live statuses.`,
          path: `currentWorkflowMappings.${mapping.mappingKey}`,
        }),
      );
    }
    if (mapping.state === "missing") {
      warnings.push(
        issue({
          id: "missing-config-mapping",
          severity: "warning",
          message: `Configured status "${mapping.configuredStatusName}" (${mapping.mappingKey}) matches no live status.`,
          path: `currentWorkflowMappings.${mapping.mappingKey}`,
        }),
      );
    }
  }

  for (const status of statuses) {
    if (status.mappingState === "ambiguous") {
      warnings.push(
        issue({
          id: "ambiguous-status-mapping",
          severity: "warning",
          message: `Status "${status.name}" has ambiguous current harness mapping.`,
          statusId: status.id,
        }),
      );
    }
  }

  const ruleIds = new Set<string>();
  const rulesBySource = new Map<string, number>();
  for (const rule of draft.rules) {
    if (ruleIds.has(rule.id)) {
      errors.push(
        issue({
          id: "duplicate-rule-id",
          message: `Duplicate rule id: ${rule.id}`,
          ruleId: rule.id,
        }),
      );
    }
    ruleIds.add(rule.id);
    rulesBySource.set(
      rule.sourceStatusId,
      (rulesBySource.get(rule.sourceStatusId) ?? 0) + 1,
    );

    if (!statusById.has(rule.sourceStatusId)) {
      errors.push(
        issue({
          id: "missing-source-status",
          message: `Rule references missing source status ${rule.sourceStatusId}.`,
          ruleId: rule.id,
          statusId: rule.sourceStatusId,
        }),
      );
    } else if (!canvasIds.has(rule.sourceStatusId)) {
      errors.push(
        issue({
          id: "source-status-not-on-canvas",
          message: `Rule source status is not on the canvas: ${rule.sourceStatusId}.`,
          ruleId: rule.id,
          statusId: rule.sourceStatusId,
        }),
      );
    }

    if (!isAssignableExecutorId(rule.executorId)) {
      errors.push(
        issue({
          id: "non-assignable-executor",
          message: `Executor "${rule.executorId}" is not assignable as a status-transition executor.`,
          ruleId: rule.id,
        }),
      );
    }

    const executor = lookupExecutor(rule.executorId);
    if (executor?.maturity === "planned") {
      infos.push(
        issue({
          id: "planned-executor",
          severity: "info",
          message: `Executor "${executor.label}" is planned/prototype-only.`,
          ruleId: rule.id,
        }),
      );
    }

    if (executor && !executor.supportsDraftModelSelection && rule.modelSelection) {
      errors.push(
        issue({
          id: "executor-model-not-supported",
          message: `Executor "${executor.label}" does not support draft model selection.`,
          ruleId: rule.id,
        }),
      );
    }

    if (
      executor?.supportsDraftModelSelection &&
      executor.kind === "cursor-agent" &&
      !rule.modelSelection
    ) {
      warnings.push(
        issue({
          id: "missing-model-selection",
          severity: "warning",
          message: `Cursor executor "${executor.label}" has no draft model selection.`,
          ruleId: rule.id,
        }),
      );
    }

    if (rule.modelSelection) {
      const model = lookupModelInCatalog(
        context.modelCatalog,
        rule.modelSelection.modelId,
      );
      if (!model || model.availability !== "available") {
        errors.push(
          issue({
            id: "model-not-in-catalog",
            message: `Selected model "${rule.modelSelection.modelId}" is not available in the current catalog.`,
            ruleId: rule.id,
          }),
        );
      } else {
        for (const selected of rule.modelSelection.parameters) {
          const definition = model.supportedParameters.find(
            (parameter) => parameter.id === selected.id,
          );
          if (!definition) {
            errors.push(
              issue({
                id: "unsupported-model-parameter",
                message: `Model parameter "${selected.id}" is not supported for ${model.id}.`,
                ruleId: rule.id,
              }),
            );
          } else if (
            definition.allowedValues &&
            !definition.allowedValues.includes(selected.value)
          ) {
            errors.push(
              issue({
                id: "invalid-model-parameter-value",
                message: `Model parameter "${selected.id}" has invalid value "${selected.value}".`,
                ruleId: rule.id,
              }),
            );
          }
        }
      }
    }

    if (rule.nestedRecoveryPolicy && rule.executorId !== "merge-runner") {
      errors.push(
        issue({
          id: "invalid-nested-recovery-policy",
          message: "Nested recovery policy is only valid for Merge Runner rules.",
          ruleId: rule.id,
        }),
      );
    }

    if (rule.enabled && rule.outcomes.length === 0) {
      errors.push(
        issue({
          id: "enabled-rule-without-outcomes",
          message: "Enabled rule must have at least one outcome.",
          ruleId: rule.id,
        }),
      );
    }

    const outcomeIds = new Set<string>();
    for (const outcome of rule.outcomes) {
      if (outcomeIds.has(outcome.id)) {
        errors.push(
          issue({
            id: "duplicate-outcome-id",
            message: `Duplicate outcome id: ${outcome.id}`,
            ruleId: rule.id,
            outcomeId: outcome.id,
          }),
        );
      }
      outcomeIds.add(outcome.id);

      if (!outcome.destinationStatusId) {
        errors.push(
          issue({
            id: "outcome-without-destination",
            message: `Outcome "${outcome.label}" has no destination status.`,
            ruleId: rule.id,
            outcomeId: outcome.id,
          }),
        );
      } else if (!statusById.has(outcome.destinationStatusId)) {
        errors.push(
          issue({
            id: "missing-destination-status",
            message: `Outcome destination status is missing: ${outcome.destinationStatusId}.`,
            ruleId: rule.id,
            outcomeId: outcome.id,
            statusId: outcome.destinationStatusId,
          }),
        );
      } else if (!canvasIds.has(outcome.destinationStatusId)) {
        errors.push(
          issue({
            id: "destination-not-on-canvas",
            message: `Outcome destination is not on the canvas: ${outcome.destinationStatusId}.`,
            ruleId: rule.id,
            outcomeId: outcome.id,
            statusId: outcome.destinationStatusId,
          }),
        );
      }

      if (
        outcome.destinationStatusId &&
        outcome.destinationStatusId === rule.sourceStatusId &&
        executor &&
        !executor.allowsSelfLoop
      ) {
        errors.push(
          issue({
            id: "invalid-self-loop",
            message: `Executor "${executor.label}" does not allow self-loops.`,
            ruleId: rule.id,
            outcomeId: outcome.id,
          }),
        );
      }
    }
  }

  for (const [sourceStatusId, count] of rulesBySource.entries()) {
    if (count > 1) {
      errors.push(
        issue({
          id: "multiple-rules-for-source",
          message: `Multiple rules exist for source status ${sourceStatusId}.`,
          statusId: sourceStatusId,
        }),
      );
    }
  }

  for (const statusId of draft.statusIdsOnCanvas) {
    if (!statusById.has(statusId)) {
      errors.push(
        issue({
          id: "canvas-status-missing-from-catalog",
          message: `Canvas status ${statusId} is not present in the current status catalog.`,
          statusId,
        }),
      );
    }
  }

  if (context.baseSnapshot && draft.baseSnapshot) {
    if (
      context.baseSnapshot.teamId &&
      draft.baseSnapshot.teamId &&
      context.baseSnapshot.teamId !== draft.baseSnapshot.teamId
    ) {
      warnings.push(
        issue({
          id: "stale-team",
          severity: "warning",
          message: "Draft base snapshot team differs from the current configured team.",
        }),
      );
    }
    if (
      context.baseSnapshot.configFingerprint !== draft.baseSnapshot.configFingerprint
    ) {
      warnings.push(
        issue({
          id: "stale-config-fingerprint",
          severity: "warning",
          message: "Draft is based on a stale active-config fingerprint.",
        }),
      );
    }
    if (
      context.baseSnapshot.statusCatalogFingerprint !==
      draft.baseSnapshot.statusCatalogFingerprint
    ) {
      warnings.push(
        issue({
          id: "stale-status-catalog-fingerprint",
          severity: "warning",
          message: "Draft is based on a stale status-catalog fingerprint.",
        }),
      );
    }
    if (
      context.baseSnapshot.modelCatalogFingerprint !==
      draft.baseSnapshot.modelCatalogFingerprint
    ) {
      warnings.push(
        issue({
          id: "stale-model-catalog-fingerprint",
          severity: "warning",
          message: "Draft is based on a stale model-catalog fingerprint.",
        }),
      );
    }
  }

  const hasEntry = draft.statusIdsOnCanvas.some((statusId) => {
    const incoming = draft.rules.some((rule) =>
      rule.outcomes.some((outcome) => outcome.destinationStatusId === statusId),
    );
    return !incoming;
  });
  if (draft.statusIdsOnCanvas.length > 0 && hasEntry) {
    warnings.push(
      issue({
        id: "no-entry-path",
        severity: "warning",
        message: "One or more canvas statuses have no incoming outcome path.",
      }),
    );
  }

  return { errors, warnings, infos };
}

export function hasValidationErrors(result: OperationsValidationResult): boolean {
  return result.errors.length > 0;
}
