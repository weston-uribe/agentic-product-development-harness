import type {
  CanonicalStatusKey,
} from "../workflow/canonical-product-development-workflow.js";
import type { RequiredWorkflowStatus } from "../setup/linear-status-contract.js";
import type { CanonicalValidationViolation } from "../workflow/canonical-workflow-validation.js";
import type { RoleModelRole } from "../config/role-models.js";

export type WorkflowSourceMode = "live" | "fixture";

export type WorkflowHealthState =
  | "healthy"
  | "blocking-configuration-error"
  | "linear-unavailable";

export interface WorkflowStatusRecord {
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

export interface WorkflowModelParameterDefinition {
  id: string;
  label: string;
  type: "boolean" | "string" | "enum";
  allowedValues?: string[];
  defaultValue?: string;
}

export interface WorkflowModelCatalogEntry {
  id: string;
  displayName: string;
  availability: "available" | "missing" | "catalog-unavailable";
  supportedParameters: WorkflowModelParameterDefinition[];
  fetchedAt?: string;
  source: "cursor-live" | "fixture";
}

export type WorkflowModelSelectionSource =
  | "roleModels"
  | "agentProvider.model.id"
  | "defaultModel.id"
  | "code-default";

export interface WorkflowModelSelection {
  modelId: string;
  displayName: string;
  parameters: Array<{ id: string; value: string }>;
  source: WorkflowModelSelectionSource;
}

export interface WorkflowCurrentWorkflowMapping {
  mappingKey: string;
  configuredStatusName: string;
  resolvedStatusIds: string[];
  state: "resolved" | "ambiguous" | "missing";
}

export interface WorkflowScope {
  id: string;
  targetRepo: string;
  baseBranch?: string;
  productionBranch?: string;
  linearTeams?: string[];
  linearProjects?: string[];
}

export type CatalogLoadState = "loaded" | "unavailable";

export interface WorkflowCatalogLoadMetadata {
  statusCatalog: CatalogLoadState;
  modelCatalog: CatalogLoadState;
}

export interface WorkflowSourceContext {
  mode: WorkflowSourceMode;
  fixtureId?: string;
  scopeId?: string;
  fixturesEnabled: boolean;
  rejectionReason?: string;
}

export interface WorkflowCanonicalWorkflowView {
  healthState: WorkflowHealthState;
  violations: CanonicalValidationViolation[];
  informationalWarnings: import("../workflow/canonical-workflow-validation.js").CanonicalInformationalWarning[];
  resolvedStatusIds: Partial<Record<CanonicalStatusKey, string>>;
  mergePathVariant: "integration-then-production" | "direct-production";
}

export type ModelSaveReadinessState =
  | "ready"
  | "catalog-unavailable"
  | "invalid-model"
  | "invalid-parameter";

export interface WorkflowRoleModelSaveReadiness {
  role: RoleModelRole;
  ready: boolean;
  state: ModelSaveReadinessState;
  issues: string[];
}

export interface ModelSaveReadiness {
  planner: WorkflowRoleModelSaveReadiness;
  builder: WorkflowRoleModelSaveReadiness;
  ready: boolean;
}

export interface WorkflowBootstrapPayload {
  sourceMode: WorkflowSourceMode;
  fixtureId?: string;
  selectedScopeId?: string;
  scopes: WorkflowScope[];
  statuses: WorkflowStatusRecord[];
  currentWorkflowMappings: WorkflowCurrentWorkflowMapping[];
  modelCatalog: WorkflowModelCatalogEntry[];
  catalogLoadMetadata: WorkflowCatalogLoadMetadata;
  plannerSelection: WorkflowModelSelection;
  builderSelection: WorkflowModelSelection;
  configFingerprint: string;
  modelSaveReadiness: ModelSaveReadiness;
  canonicalWorkflow: WorkflowCanonicalWorkflowView;
  warnings: string[];
  debugEnabled?: boolean;
  dataSourceLabel: string;
}
