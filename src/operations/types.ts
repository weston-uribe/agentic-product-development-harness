import type { RequiredWorkflowStatus } from "../setup/linear-status-contract.js";

export type OperationsSourceMode = "live" | "fixture";

export type OperationsExecutorKind = "cursor-agent" | "system-runner" | "human-gate";

export type OperationsExecutorMaturity =
  | "implemented"
  | "planned"
  | "human"
  | "system";

export type OperationsTriggerScope =
  | "status-transition"
  | "nested-recovery"
  | "external-system";

export type OperationsModelSelectionMode =
  | "runtime-current-only"
  | "draft-configurable"
  | "draft-only-planned"
  | "none";

export interface OperationsStatusRecord {
  id: string;
  name: string;
  category: string;
  color?: string;
  source: "linear-live" | "fixture";
  requiredWorkflowRole?: RequiredWorkflowStatus["role"];
  participatesInCurrentHarnessWorkflow: boolean;
  automationTriggerStatus: boolean;
  currentMappingKeys: string[];
  mappingState: "resolved" | "ambiguous" | "missing" | "unmapped";
}

export interface OperationsExecutorCatalogEntry {
  id: string;
  label: string;
  kind: OperationsExecutorKind;
  maturity: OperationsExecutorMaturity;
  triggerScope: OperationsTriggerScope;
  supportsDraftModelSelection: boolean;
  modelSelectionMode: OperationsModelSelectionMode;
  allowsSelfLoop: boolean;
  defaultOutcomeTemplates: Array<{ label: string }>;
  honestyNote: string;
}

export interface OperationsNestedCapability {
  id: string;
  label: string;
  ownerExecutorId?: string;
  triggerScope: OperationsTriggerScope;
  maturity: OperationsExecutorMaturity;
  currentRuntimeBehavior: string;
  prototypeOptions?: string[];
  honestyNote: string;
}

export interface OperationsModelParameterDefinition {
  id: string;
  label: string;
  type: "boolean" | "string" | "enum";
  allowedValues?: string[];
  defaultValue?: string;
}

export interface OperationsModelCatalogEntry {
  id: string;
  displayName: string;
  availability: "available" | "missing" | "catalog-unavailable";
  supportedParameters: OperationsModelParameterDefinition[];
  fetchedAt?: string;
  source: "cursor-live" | "fixture";
}

export interface OperationsCurrentModelSummary {
  providerId: "cursor";
  resolvedModelId: string;
  configuredModelId?: string;
  source: "agentProvider.model.id" | "defaultModel.id" | "code-default";
  pinnedParams: ReadonlyArray<{ id: string; value: string }>;
  policyNote: string;
  draftOnlyNote: string;
}

export interface OperationsCurrentWorkflowMapping {
  mappingKey: string;
  configuredStatusName: string;
  resolvedStatusIds: string[];
  state: "resolved" | "ambiguous" | "missing";
}

export interface OperationsDraftModelSelection {
  modelId: string;
  displayNameAtSelection: string;
  parameters: Array<{ id: string; value: string }>;
}

export interface OperationsNestedRecoveryPolicy {
  deterministicRepairEnabled: boolean;
  cursorAgentFallbackEnabled: boolean;
  prototypeFutureModelOverride?: OperationsDraftModelSelection;
}

export interface OperationsOutcome {
  id: string;
  label: string;
  destinationStatusId?: string;
  enabled: boolean;
}

export interface OperationsRule {
  id: string;
  sourceStatusId: string;
  enabled: boolean;
  executorId: string;
  modelSelection?: OperationsDraftModelSelection;
  nestedRecoveryPolicy?: OperationsNestedRecoveryPolicy;
  outcomes: OperationsOutcome[];
}

export interface OperationsLayoutPosition {
  x: number;
  y: number;
}

export interface OperationsViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface OperationsLayout {
  statusPositions: Record<string, OperationsLayoutPosition>;
  viewport?: OperationsViewport;
  inspectorCollapsed?: boolean;
}

export interface OperationsWorkflowScope {
  id: string;
  targetRepo: string;
  linearTeams?: string[];
  linearProjects?: string[];
}

export interface OperationsBaseSnapshot {
  teamId?: string;
  teamKey?: string;
  scopeId?: string;
  configFingerprint: string;
  statusCatalogFingerprint: string;
  modelCatalogFingerprint: string;
  workflowFingerprint: string;
}

export interface OperationsWorkflowDraft {
  schemaVersion: 1;
  draftId: string;
  createdAt: string;
  updatedAt: string;
  savedByRuntime: "source-gui" | "packaged-gui" | "fixture-test";
  sourceMode: OperationsSourceMode;
  baseSnapshot: OperationsBaseSnapshot;
  statusIdsOnCanvas: string[];
  rules: OperationsRule[];
  layout: OperationsLayout;
  warningsAtSave?: string[];
}

export type OperationsValidationSeverity = "error" | "warning" | "info";

export interface OperationsValidationIssue {
  id: string;
  severity: OperationsValidationSeverity;
  message: string;
  path?: string;
  statusId?: string;
  ruleId?: string;
  outcomeId?: string;
}

export interface OperationsValidationResult {
  errors: OperationsValidationIssue[];
  warnings: OperationsValidationIssue[];
  infos: OperationsValidationIssue[];
}

export type CatalogLoadState = "loaded" | "unavailable";

export interface OperationsCatalogLoadMetadata {
  statusCatalog: CatalogLoadState;
  modelCatalog: CatalogLoadState;
}

export interface OperationsSourceContext {
  mode: OperationsSourceMode;
  fixtureId?: string;
  scopeId?: string;
  fixturesEnabled: boolean;
  rejectionReason?: string;
}

export interface OperationsBootstrapPayload {
  sourceMode: OperationsSourceMode;
  fixtureId?: string;
  selectedScopeId?: string;
  scopes: OperationsWorkflowScope[];
  legacyDraftReviewRequired?: boolean;
  debugEnabled?: boolean;
  dataSourceLabel: string;
  statuses: OperationsStatusRecord[];
  executors: OperationsExecutorCatalogEntry[];
  nestedCapabilities: OperationsNestedCapability[];
  currentWorkflowMappings: OperationsCurrentWorkflowMapping[];
  currentModel: OperationsCurrentModelSummary;
  modelCatalog: OperationsModelCatalogEntry[];
  catalogLoadMetadata: OperationsCatalogLoadMetadata;
  draft: OperationsWorkflowDraft | null;
  validation: OperationsValidationResult;
  warnings: string[];
}
