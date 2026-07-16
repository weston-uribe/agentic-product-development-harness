import type {
  CanonicalAgentPhaseKey,
  CanonicalStatusKey,
} from "../workflow/canonical-product-development-workflow.js";
import type { RequiredWorkflowStatus } from "../setup/linear-status-contract.js";
import type { CanonicalValidationViolation } from "../workflow/canonical-workflow-validation.js";

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

export type OperationsWorkflowHealthState =
  | "healthy"
  | "blocking-configuration-error"
  | "linear-unavailable";

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
  canonicalStatusKey?: CanonicalStatusKey;
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
  statusPositions: Partial<Record<CanonicalStatusKey, OperationsLayoutPosition>>;
  viewport?: OperationsViewport;
}

export interface OperationsWorkflowScope {
  id: string;
  targetRepo: string;
  baseBranch?: string;
  productionBranch?: string;
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

export interface OperationsDraftMetadata {
  migratedFromV1?: boolean;
  migrationNotice?: string;
}

export interface OperationsWorkflowDraft {
  schemaVersion: 2;
  draftId: string;
  createdAt: string;
  updatedAt: string;
  savedByRuntime: "source-gui" | "packaged-gui" | "fixture-test";
  sourceMode: OperationsSourceMode;
  baseSnapshot: OperationsBaseSnapshot;
  layout: OperationsLayout;
  phaseModelSettings: Partial<
    Record<CanonicalAgentPhaseKey, OperationsDraftModelSelection>
  >;
  metadata?: OperationsDraftMetadata;
  warningsAtSave?: string[];
}

/** Legacy V1 prototype draft shape — loaded only for migration. */
export interface OperationsWorkflowDraftV1 {
  schemaVersion: 1;
  draftId: string;
  createdAt: string;
  updatedAt: string;
  savedByRuntime: "source-gui" | "packaged-gui" | "fixture-test";
  sourceMode: OperationsSourceMode;
  baseSnapshot: OperationsBaseSnapshot;
  statusIdsOnCanvas: string[];
  rules: Array<{
    id: string;
    sourceStatusId: string;
    enabled: boolean;
    executorId: string;
    modelSelection?: OperationsDraftModelSelection;
    nestedRecoveryPolicy?: {
      deterministicRepairEnabled: boolean;
      cursorAgentFallbackEnabled: boolean;
      prototypeFutureModelOverride?: OperationsDraftModelSelection;
    };
    outcomes: Array<{
      id: string;
      label: string;
      destinationStatusId?: string;
      enabled: boolean;
    }>;
  }>;
  layout: {
    statusPositions: Record<string, OperationsLayoutPosition>;
    viewport?: OperationsViewport;
    inspectorCollapsed?: boolean;
  };
  warningsAtSave?: string[];
}

export type OperationsValidationSeverity = "error" | "warning" | "info";

export interface OperationsValidationIssue {
  id: string;
  severity: OperationsValidationSeverity;
  message: string;
  path?: string;
  statusId?: string;
  canonicalStatusKey?: CanonicalStatusKey;
  phaseKey?: CanonicalAgentPhaseKey;
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

export interface OperationsCanonicalWorkflowView {
  healthState: OperationsWorkflowHealthState;
  violations: CanonicalValidationViolation[];
  informationalWarnings: import("../workflow/canonical-workflow-validation.js").CanonicalInformationalWarning[];
  resolvedStatusIds: Partial<Record<CanonicalStatusKey, string>>;
  mergePathVariant: "integration-then-production" | "direct-production";
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
  currentWorkflowMappings: OperationsCurrentWorkflowMapping[];
  currentModel: OperationsCurrentModelSummary;
  modelCatalog: OperationsModelCatalogEntry[];
  catalogLoadMetadata: OperationsCatalogLoadMetadata;
  draft: OperationsWorkflowDraft | null;
  validation: OperationsValidationResult;
  canonicalWorkflow: OperationsCanonicalWorkflowView;
  warnings: string[];
}
