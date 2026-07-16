import type {
  WorkflowModelCatalogEntry,
  WorkflowModelParameterDefinition,
} from "./types.js";
import { hashWorkflowFingerprint } from "./fingerprint.js";

interface RawCursorModel {
  id: string;
  name?: string;
  displayName?: string;
  parameters?: Array<{
    id: string;
    name?: string;
    label?: string;
    type?: string;
    allowedValues?: string[];
    defaultValue?: string;
  }>;
}

function normalizeParameter(
  parameter: NonNullable<RawCursorModel["parameters"]>[number],
): WorkflowModelParameterDefinition {
  const type =
    parameter.type === "boolean" ||
    parameter.type === "enum" ||
    parameter.type === "string"
      ? parameter.type
      : parameter.allowedValues && parameter.allowedValues.length > 0
        ? "enum"
        : "string";

  return {
    id: parameter.id,
    label: parameter.label ?? parameter.name ?? parameter.id,
    type,
    allowedValues: parameter.allowedValues,
    defaultValue: parameter.defaultValue,
  };
}

export function normalizeCursorModelCatalog(
  models: RawCursorModel[],
  source: "cursor-live" | "fixture",
  fetchedAt: string,
): WorkflowModelCatalogEntry[] {
  return models.map((model) => ({
    id: model.id,
    displayName: model.displayName ?? model.name ?? model.id,
    availability: "available" as const,
    supportedParameters: (model.parameters ?? []).map(normalizeParameter),
    fetchedAt,
    source,
  }));
}

export function buildCatalogUnavailableEntry(
  source: "cursor-live" | "fixture",
): WorkflowModelCatalogEntry[] {
  return [
    {
      id: "catalog-unavailable",
      displayName: "Model catalog unavailable",
      availability: "catalog-unavailable",
      supportedParameters: [],
      source,
    },
  ];
}

export function buildModelCatalogFingerprint(
  catalog: WorkflowModelCatalogEntry[],
): string {
  return hashWorkflowFingerprint(
    catalog.map((entry) => ({
      id: entry.id,
      availability: entry.availability,
      parameters: entry.supportedParameters.map((parameter) => parameter.id),
    })),
  );
}

export type { RawCursorModel };
