import { z } from "zod";
import { OPERATIONS_DRAFT_SCHEMA_VERSION } from "./constants.js";

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

export const operationsNestedRecoveryPolicySchema = z.object({
  deterministicRepairEnabled: z.boolean().default(true),
  cursorAgentFallbackEnabled: z.boolean().default(true),
  prototypeFutureModelOverride: operationsDraftModelSelectionSchema.optional(),
});

export const operationsOutcomeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  destinationStatusId: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
});

export const operationsRuleSchema = z.object({
  id: z.string().min(1),
  sourceStatusId: z.string().min(1),
  enabled: z.boolean().default(true),
  executorId: z.string().min(1),
  modelSelection: operationsDraftModelSelectionSchema.optional(),
  nestedRecoveryPolicy: operationsNestedRecoveryPolicySchema.optional(),
  outcomes: z.array(operationsOutcomeSchema).default([]),
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
  statusPositions: z.record(operationsLayoutPositionSchema).default({}),
  viewport: operationsViewportSchema.optional(),
  inspectorCollapsed: z.boolean().optional(),
});

export const operationsBaseSnapshotSchema = z.object({
  teamId: z.string().optional(),
  teamKey: z.string().optional(),
  configFingerprint: z.string().min(1),
  statusCatalogFingerprint: z.string().min(1),
  modelCatalogFingerprint: z.string().min(1),
  workflowFingerprint: z.string().min(1),
});

export const operationsWorkflowDraftSchema = z.object({
  schemaVersion: z.literal(OPERATIONS_DRAFT_SCHEMA_VERSION),
  draftId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  savedByRuntime: z.enum(["source-gui", "packaged-gui", "fixture-test"]),
  sourceMode: operationsSourceModeSchema,
  baseSnapshot: operationsBaseSnapshotSchema,
  statusIdsOnCanvas: z.array(z.string().min(1)).default([]),
  rules: z.array(operationsRuleSchema).default([]),
  layout: operationsLayoutSchema.default({ statusPositions: {} }),
  warningsAtSave: z.array(z.string()).optional(),
});

export const operationsDraftSaveRequestSchema = operationsWorkflowDraftSchema;

export type OperationsWorkflowDraftInput = z.infer<
  typeof operationsWorkflowDraftSchema
>;
