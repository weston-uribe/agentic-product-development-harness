import {
  HARNESS_COMPATIBILITY_VERSION,
  HARNESS_MANAGED_REPO_MARKER_FILE,
  HARNESS_MARKER_VERSION,
  HARNESS_PRODUCT,
  HARNESS_SCHEMA_VERSION,
  HARNESS_TEMPLATE_IDENTITY,
  HARNESS_TEMPLATE_SLUG,
  HARNESS_WORKSPACE_ROLE,
  type HarnessTemplateIdentity,
} from "./harness-template-identity.js";

export { HARNESS_MANAGED_REPO_MARKER_FILE };

export interface HarnessManagedRepoMarker {
  schemaVersion: number;
  product: string;
  role: string;
  managedBy: string;
  repository: string;
  markerVersion: number;
  operationId?: string;
  createdByGithubUserId?: number;
  createdByLogin?: string;
  pDevVersion?: string;
  createdFromTemplate: {
    templateRepository: string;
    defaultBranch: string;
    templateIdentity: string;
    templateVersion: number;
    compatibilityVersion: number;
    templateContentId: string;
    sourceHeadSha: string;
  };
}

export type HarnessManagedRepoMarkerValidationResult =
  | { ok: true; marker: HarnessManagedRepoMarker }
  | { ok: false; reason: string };

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): { ok: true; value: string } | { ok: false; reason: string } {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, reason: `Managed marker is missing ${label}.` };
  }
  return { ok: true, value: value.trim() };
}

function readRequiredNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
): { ok: true; value: number } | { ok: false; reason: string } {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, reason: `Managed marker is missing ${label}.` };
  }
  return { ok: true, value };
}

export function parseHarnessManagedRepoMarkerJson(
  raw: string,
): HarnessManagedRepoMarkerValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "Managed marker JSON is malformed." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "Managed marker JSON is malformed." };
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== HARNESS_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Unsupported managed marker schema version ${String(record.schemaVersion)}.`,
    };
  }
  if (record.product !== HARNESS_PRODUCT) {
    return {
      ok: false,
      reason: `Unexpected managed marker product ${String(record.product)}.`,
    };
  }
  if (record.role !== HARNESS_WORKSPACE_ROLE) {
    return {
      ok: false,
      reason: `Unexpected managed marker role ${String(record.role)}.`,
    };
  }
  if (record.managedBy !== "p-dev") {
    return {
      ok: false,
      reason: `Unexpected managedBy value ${String(record.managedBy)}.`,
    };
  }

  const repository = readRequiredString(record, "repository", "a valid repository slug");
  if (!repository.ok) {
    return { ok: false, reason: repository.reason };
  }
  if (!repository.value.includes("/")) {
    return {
      ok: false,
      reason: "Managed marker is missing a valid repository slug.",
    };
  }

  const markerVersion = readRequiredNumber(record, "markerVersion", "markerVersion");
  if (!markerVersion.ok) {
    return { ok: false, reason: markerVersion.reason };
  }
  if (markerVersion.value !== HARNESS_MARKER_VERSION) {
    return {
      ok: false,
      reason: `Unsupported managed marker version ${String(markerVersion.value)}.`,
    };
  }

  const createdFromTemplate = record.createdFromTemplate;
  if (!createdFromTemplate || typeof createdFromTemplate !== "object") {
    return {
      ok: false,
      reason: "Managed marker is missing createdFromTemplate metadata.",
    };
  }

  const template = createdFromTemplate as Record<string, unknown>;
  const templateRepository = readRequiredString(
    template,
    "templateRepository",
    "createdFromTemplate.templateRepository",
  );
  if (!templateRepository.ok) {
    return { ok: false, reason: templateRepository.reason };
  }
  if (templateRepository.value !== HARNESS_TEMPLATE_SLUG) {
    return {
      ok: false,
      reason: `Unexpected template repository ${templateRepository.value}.`,
    };
  }
  const defaultBranch = readRequiredString(
    template,
    "defaultBranch",
    "createdFromTemplate.defaultBranch",
  );
  if (!defaultBranch.ok) {
    return { ok: false, reason: defaultBranch.reason };
  }
  const templateIdentity = readRequiredString(
    template,
    "templateIdentity",
    "createdFromTemplate.templateIdentity",
  );
  if (!templateIdentity.ok) {
    return { ok: false, reason: templateIdentity.reason };
  }
  if (templateIdentity.value !== HARNESS_TEMPLATE_IDENTITY) {
    return {
      ok: false,
      reason: `Unexpected template identity ${templateIdentity.value}.`,
    };
  }
  const templateVersion = readRequiredNumber(
    template,
    "templateVersion",
    "createdFromTemplate.templateVersion",
  );
  if (!templateVersion.ok) {
    return { ok: false, reason: templateVersion.reason };
  }
  if (templateVersion.value !== HARNESS_MARKER_VERSION) {
    return {
      ok: false,
      reason: `Unsupported template version ${String(templateVersion.value)}.`,
    };
  }
  const compatibilityVersion = readRequiredNumber(
    template,
    "compatibilityVersion",
    "createdFromTemplate.compatibilityVersion",
  );
  if (!compatibilityVersion.ok) {
    return { ok: false, reason: compatibilityVersion.reason };
  }
  if (compatibilityVersion.value !== HARNESS_COMPATIBILITY_VERSION) {
    return {
      ok: false,
      reason: `Incompatible managed marker compatibility version ${String(compatibilityVersion.value)}.`,
    };
  }
  const templateContentId = readRequiredString(
    template,
    "templateContentId",
    "createdFromTemplate.templateContentId",
  );
  if (!templateContentId.ok) {
    return { ok: false, reason: templateContentId.reason };
  }
  const sourceHeadSha = readRequiredString(
    template,
    "sourceHeadSha",
    "createdFromTemplate.sourceHeadSha",
  );
  if (!sourceHeadSha.ok) {
    return { ok: false, reason: sourceHeadSha.reason };
  }

  return {
    ok: true,
    marker: {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      product: HARNESS_PRODUCT,
      role: HARNESS_WORKSPACE_ROLE,
      managedBy: "p-dev",
      repository: repository.value,
      markerVersion: markerVersion.value,
      operationId:
        typeof record.operationId === "string" ? record.operationId : undefined,
      createdByGithubUserId:
        typeof record.createdByGithubUserId === "number"
          ? record.createdByGithubUserId
          : undefined,
      createdByLogin:
        typeof record.createdByLogin === "string" ? record.createdByLogin : undefined,
      pDevVersion:
        typeof record.pDevVersion === "string" ? record.pDevVersion : undefined,
      createdFromTemplate: {
        templateRepository: templateRepository.value,
        defaultBranch: defaultBranch.value,
        templateIdentity: templateIdentity.value,
        templateVersion: templateVersion.value,
        compatibilityVersion: compatibilityVersion.value,
        templateContentId: templateContentId.value,
        sourceHeadSha: sourceHeadSha.value,
      },
    },
  };
}

export function validateManagedMarkerForReconnect(
  marker: HarnessManagedRepoMarker,
  repoSlug: string,
): { ok: true } | { ok: false; reason: string } {
  if (marker.repository !== repoSlug) {
    return {
      ok: false,
      reason: `Managed marker repository mismatch for ${repoSlug}.`,
    };
  }
  if (marker.createdFromTemplate.templateRepository !== HARNESS_TEMPLATE_SLUG) {
    return {
      ok: false,
      reason: `Managed marker template repository must be ${HARNESS_TEMPLATE_SLUG}.`,
    };
  }
  if (marker.createdFromTemplate.templateIdentity !== HARNESS_TEMPLATE_IDENTITY) {
    return {
      ok: false,
      reason: `Unexpected managed marker template identity ${marker.createdFromTemplate.templateIdentity}.`,
    };
  }
  if (marker.createdFromTemplate.templateVersion !== HARNESS_MARKER_VERSION) {
    return {
      ok: false,
      reason: `Unsupported managed marker template version ${marker.createdFromTemplate.templateVersion}.`,
    };
  }
  if (
    marker.createdFromTemplate.compatibilityVersion !== HARNESS_COMPATIBILITY_VERSION
  ) {
    return {
      ok: false,
      reason: `Incompatible managed marker compatibility version ${marker.createdFromTemplate.compatibilityVersion}.`,
    };
  }
  return { ok: true };
}

export function buildHarnessManagedRepoMarker(input: {
  repository: string;
  templateIdentity: HarnessTemplateIdentity;
  defaultBranch: string;
  sourceHeadSha: string;
  operationId?: string;
  createdByGithubUserId?: number;
  createdByLogin?: string;
  pDevVersion?: string;
}): HarnessManagedRepoMarker {
  return {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    product: HARNESS_PRODUCT,
    role: HARNESS_WORKSPACE_ROLE,
    managedBy: "p-dev",
    repository: input.repository,
    markerVersion: HARNESS_MARKER_VERSION,
    operationId: input.operationId,
    createdByGithubUserId: input.createdByGithubUserId,
    createdByLogin: input.createdByLogin,
    pDevVersion: input.pDevVersion,
    createdFromTemplate: {
      templateRepository: HARNESS_TEMPLATE_SLUG,
      defaultBranch: input.defaultBranch,
      templateIdentity: input.templateIdentity.templateIdentity,
      templateVersion: input.templateIdentity.templateVersion,
      compatibilityVersion: input.templateIdentity.compatibilityVersion,
      templateContentId: input.templateIdentity.templateContentId,
      sourceHeadSha: input.sourceHeadSha,
    },
  };
}

export function markersAreEquivalentForOperation(
  existing: HarnessManagedRepoMarker,
  expected: HarnessManagedRepoMarker,
): boolean {
  return (
    existing.repository === expected.repository &&
    existing.operationId === expected.operationId &&
    existing.createdFromTemplate.templateIdentity ===
      expected.createdFromTemplate.templateIdentity &&
    existing.createdFromTemplate.compatibilityVersion ===
      expected.createdFromTemplate.compatibilityVersion &&
    existing.createdFromTemplate.templateContentId ===
      expected.createdFromTemplate.templateContentId &&
    existing.createdFromTemplate.sourceHeadSha ===
      expected.createdFromTemplate.sourceHeadSha
  );
}

export function markerValidForExistingWorkspace(
  existing: HarnessManagedRepoMarker,
  repoSlug: string,
): boolean {
  return validateManagedMarkerForReconnect(existing, repoSlug).ok;
}
