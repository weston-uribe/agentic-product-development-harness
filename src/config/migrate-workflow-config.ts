/**
 * Read-only migration from legacy config to workflow section defaults.
 * Does not write files or change effective routing behavior.
 */

import {
  DEFAULT_CYCLE_LIMITS,
  DEFAULT_OPTIONAL_PHASES,
  WORKFLOW_SCHEMA_VERSION,
} from "../workflow/definition/product-development.v2.js";

export interface WorkflowConfigSection {
  schemaVersion: string;
  optionalPhases: {
    planReview: boolean;
    codeReview: boolean;
  };
  cycleLimits: {
    planReview: number;
    codeReview: number;
  };
}

export interface MigratableConfig {
  workflow?: Partial<{
    schemaVersion?: string;
    optionalPhases?: Partial<{
      planReview?: boolean;
      codeReview?: boolean;
    }>;
    cycleLimits?: Partial<{
      planReview?: number;
      codeReview?: number;
    }>;
  }>;
  linear?: unknown;
}

/**
 * Fill workflow defaults in memory. Preserves any explicit workflow fields.
 * Optional reviewers remain disabled so today's paths are unchanged.
 */
export function migrateWorkflowConfigSection(
  config: MigratableConfig,
): WorkflowConfigSection {
  const existing = config.workflow;
  return {
    schemaVersion: existing?.schemaVersion ?? WORKFLOW_SCHEMA_VERSION,
    optionalPhases: {
      planReview:
        existing?.optionalPhases?.planReview ??
        DEFAULT_OPTIONAL_PHASES.planReview,
      codeReview:
        existing?.optionalPhases?.codeReview ??
        DEFAULT_OPTIONAL_PHASES.codeReview,
    },
    cycleLimits: {
      planReview:
        existing?.cycleLimits?.planReview ??
        DEFAULT_CYCLE_LIMITS.plan_review_cycles,
      codeReview:
        existing?.cycleLimits?.codeReview ??
        DEFAULT_CYCLE_LIMITS.code_review_cycles,
    },
  };
}

/**
 * Returns true when migrated defaults match “current behavior” (reviewers off).
 */
export function migratedWorkflowPreservesCurrentBehavior(
  section: WorkflowConfigSection,
): boolean {
  return (
    section.optionalPhases.planReview === false &&
    section.optionalPhases.codeReview === false
  );
}
