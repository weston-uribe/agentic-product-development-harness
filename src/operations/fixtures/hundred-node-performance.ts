import type { OperationsFixtureDefinition } from "../fixture-definition.js";

function buildPerformanceStatuses() {
  const statuses = [];
  for (let index = 1; index <= 100; index += 1) {
    statuses.push({
      id: `perf-status-${index}`,
      name: `Performance Status ${index}`,
      type: index % 5 === 0 ? "completed" : index % 3 === 0 ? "started" : "unstarted",
    });
  }
  return statuses;
}

export const hundredNodePerformanceFixture: OperationsFixtureDefinition = {
  id: "hundred-node-performance",
  statuses: buildPerformanceStatuses(),
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
  warnings: ["Fixture includes 100 statuses for canvas performance testing."],
};
