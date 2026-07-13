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
  if (typeof record.repository !== "string" || !record.repository.includes("/")) {
    return {
      ok: false,
      reason: "Managed marker is missing a valid repository slug.",
    };
  }
  if (record.markerVersion !== HARNESS_MARKER_VERSION) {
    return {
      ok: false,
      reason: `Unsupported managed marker version ${String(record.markerVersion)}.`,
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
  if (template.templateIdentity !== HARNESS_TEMPLATE_IDENTITY) {
    return {
      ok: false,
      reason: `Unexpected template identity ${String(template.templateIdentity)}.`,
    };
  }
  if (template.compatibilityVersion !== HARNESS_COMPATIBILITY_VERSION) {
    return {
      ok: false,
      reason: `Incompatible managed marker compatibility version ${String(template.compatibilityVersion)}.`,
    };
  }
  if (
    typeof template.templateContentId !== "string" ||
    !template.templateContentId.trim()
  ) {
    return {
      ok: false,
      reason: "Managed marker is missing templateContentId.",
    };
  }
  if (typeof template.sourceHeadSha !== "string" || !template.sourceHeadSha.trim()) {
    return {
      ok: false,
      reason: "Managed marker is missing sourceHeadSha.",
    };
  }

  return {
    ok: true,
    marker: {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      product: HARNESS_PRODUCT,
      role: HARNESS_WORKSPACE_ROLE,
      managedBy: "p-dev",
      repository: record.repository,
      markerVersion: HARNESS_MARKER_VERSION,
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
        templateRepository:
          typeof template.templateRepository === "string"
            ? template.templateRepository
            : HARNESS_TEMPLATE_SLUG,
        defaultBranch:
          typeof template.defaultBranch === "string"
            ? template.defaultBranch
            : "main",
        templateIdentity: HARNESS_TEMPLATE_IDENTITY,
        templateVersion:
          typeof template.templateVersion === "number"
            ? template.templateVersion
            : HARNESS_MARKER_VERSION,
        compatibilityVersion: HARNESS_COMPATIBILITY_VERSION,
        templateContentId: template.templateContentId.trim(),
        sourceHeadSha: template.sourceHeadSha.trim(),
      },
    },
  };
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

export function markerValidForReconnect(
  existing: HarnessManagedRepoMarker,
  expected: {
    repository: string;
    templateContentId: string;
    sourceHeadSha: string;
  },
): boolean {
  return (
    existing.repository === expected.repository &&
    existing.createdFromTemplate.templateContentId ===
      expected.templateContentId &&
    existing.createdFromTemplate.sourceHeadSha === expected.sourceHeadSha &&
    existing.createdFromTemplate.compatibilityVersion ===
      HARNESS_COMPATIBILITY_VERSION
  );
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
