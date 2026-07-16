import { z } from "zod";
import {
  CANONICAL_AGENT_PHASES,
  CANONICAL_STATUSES,
  CANONICAL_WORKFLOW_FINGERPRINT,
} from "../workflow/canonical-product-development-workflow.js";
import { OPERATIONS_DRAFT_SCHEMA_VERSION } from "./constants.js";

const canonicalStatusKeySchema = z.enum(
  CANONICAL_STATUSES.map((status) => status.key) as [
    (typeof CANONICAL_STATUSES)[number]["key"],
    ...(typeof CANONICAL_STATUSES)[number]["key"][],
  ],
);

const canonicalAgentPhaseKeySchema = z.enum(
  CANONICAL_AGENT_PHASES.map((phase) => phase.key) as [
    (typeof CANONICAL_AGENT_PHASES)[number]["key"],
    ...(typeof CANONICAL_AGENT_PHASES)[number]["key"][],
  ],
);

export const operationsSourceModeSchema = z.enum(["live", "fixture"]);

export const operationsModelParameterSchema = z.object({
  id: z.string().min(1),
  value: z.string(),
});

export const operationsDraftModelSelectionSchema = z.object({
  modelId: z.string().min(1),
  displayNameAtSelection: z.string().min(1),
  parameters: z.array(operationsModelParameterSchema).default([]),
});

export const operationsLayoutPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const operationsViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});

export const operationsLayoutSchema = z.object({
  statusPositions: z
    .record(canonicalStatusKeySchema, operationsLayoutPositionSchema)
    .default({}),
  viewport: operationsViewportSchema.optional(),
});

export const operationsBaseSnapshotSchema = z.object({
  teamId: z.string().optional(),
  teamKey: z.string().optional(),
  scopeId: z.string().optional(),
  configFingerprint: z.string().min(1),
  statusCatalogFingerprint: z.string().min(1),
  modelCatalogFingerprint: z.string().min(1),
  workflowFingerprint: z.string().min(1),
});

export const operationsDraftMetadataSchema = z.object({
  migratedFromV1: z.boolean().optional(),
  migrationNotice: z.string().optional(),
});

export const operationsWorkflowDraftSchema = z.object({
  schemaVersion: z.literal(OPERATIONS_DRAFT_SCHEMA_VERSION),
  draftId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  savedByRuntime: z.enum(["source-gui", "packaged-gui", "fixture-test"]),
  sourceMode: operationsSourceModeSchema,
  baseSnapshot: operationsBaseSnapshotSchema,
  layout: operationsLayoutSchema.default({ statusPositions: {} }),
  phaseModelSettings: z
    .record(canonicalAgentPhaseKeySchema, operationsDraftModelSelectionSchema)
    .default({}),
  metadata: operationsDraftMetadataSchema.optional(),
  warningsAtSave: z.array(z.string()).optional(),
});

export const operationsDraftSaveRequestSchema = operationsWorkflowDraftSchema;

/** Legacy V1 schema retained for migration only. */
export const operationsWorkflowDraftV1Schema = z.object({
  schemaVersion: z.literal(1),
  draftId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  savedByRuntime: z.enum(["source-gui", "packaged-gui", "fixture-test"]),
  sourceMode: operationsSourceModeSchema,
  baseSnapshot: operationsBaseSnapshotSchema,
  statusIdsOnCanvas: z.array(z.string().min(1)).default([]),
  rules: z.array(z.any()).default([]),
  layout: z
    .object({
      statusPositions: z.record(operationsLayoutPositionSchema).default({}),
      viewport: operationsViewportSchema.optional(),
      inspectorCollapsed: z.boolean().optional(),
    })
    .default({ statusPositions: {} }),
  warningsAtSave: z.array(z.string()).optional(),
});

export type OperationsWorkflowDraftInput = z.infer<
  typeof operationsWorkflowDraftSchema
>;

export const CANONICAL_OPERATIONS_WORKFLOW_FINGERPRINT =
  CANONICAL_WORKFLOW_FINGERPRINT;
