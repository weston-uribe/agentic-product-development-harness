export const OPERATIONS_DRAFT_FILENAME = "operations-workflow-draft.local.json";

export const OPERATIONS_DRAFT_SCHEMA_VERSION = 1 as const;

export const P_DEV_OPERATIONS_FIXTURES_ENV = "P_DEV_OPERATIONS_FIXTURES";

export const OPERATIONS_FIXTURE_IDS = [
  "basic-current-workflow",
  "branching-pr-review",
  "empty-linear-statuses",
  "credential-errors",
  "hundred-node-performance",
] as const;

export type OperationsFixtureId = (typeof OPERATIONS_FIXTURE_IDS)[number];

export function isOperationsFixtureId(value: string): value is OperationsFixtureId {
  return (OPERATIONS_FIXTURE_IDS as readonly string[]).includes(value);
}
