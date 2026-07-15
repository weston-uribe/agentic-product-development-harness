import type { OperationsFixtureDefinition } from "../fixture-definition.js";

const WORKFLOW_STATUSES = [
  ["status-backlog", "Backlog", "backlog"],
  ["status-ready-planning", "Ready for Planning", "unstarted"],
  ["status-planning", "Planning", "started"],
  ["status-ready-build", "Ready for Build", "unstarted"],
  ["status-building", "Building", "started"],
  ["status-pr-open", "PR Open", "started"],
  ["status-pm-review", "PM Review", "started"],
  ["status-eng-review", "Engineering Review", "started"],
  ["status-needs-revision", "Needs Revision", "unstarted"],
  ["status-revising", "Revising", "started"],
  ["status-ready-merge", "Ready to Merge", "started"],
  ["status-merging", "Merging", "started"],
  ["status-merged-dev", "Merged to Dev", "completed"],
  ["status-merged-deployed", "Merged / Deployed", "completed"],
  ["status-blocked", "Blocked", "started"],
  ["status-canceled", "Canceled", "canceled"],
  ["status-duplicate", "Duplicate", "canceled"],
] as const;

export const basicCurrentWorkflowFixture: OperationsFixtureDefinition = {
  id: "basic-current-workflow",
  statuses: WORKFLOW_STATUSES.map(([id, name, type]) => ({
    id,
    name,
    type,
  })),
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
          defaultValue: "true",
        },
      ],
      fetchedAt: "2026-01-01T00:00:00.000Z",
      source: "fixture",
    },
  ],
  warnings: [],
};

export { WORKFLOW_STATUSES };
