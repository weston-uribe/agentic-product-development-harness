import { fingerprintHarnessTemplateIdentity } from "./harness-template-identity.js";
import type { HarnessTemplateIdentity } from "./harness-template-identity.js";
import {
  HARNESS_TEMPLATE_OWNER,
  HARNESS_TEMPLATE_REPO,
} from "./harness-template-identity.js";

export type HarnessProvisioningClassification =
  | "absent"
  | "valid-managed"
  | "public-collision"
  | "unmanaged-collision"
  | "malformed-marker"
  | "template-only-without-pending"
  | "template-only-with-pending";

export interface HarnessProvisioningPreviewContext {
  operationId: string;
  authenticatedUserId: number;
  authenticatedLogin: string;
  destination: string;
  templateOwner: string;
  templateRepo: string;
  templateDefaultBranch: string;
  templateHeadSha: string;
  templateIdentityFingerprint: string;
  templateContentId: string;
  classification: HarnessProvisioningClassification;
  envBaseline: string;
  pDevVersion: string;
  resumedFromPending: boolean;
  creationPreviewFingerprint: string | null;
}

export type HarnessProvisioningContextField =
  | "operationId"
  | "authenticatedUserId"
  | "authenticatedLogin"
  | "destination"
  | "templateOwner"
  | "templateRepo"
  | "templateDefaultBranch"
  | "templateHeadSha"
  | "templateIdentityFingerprint"
  | "templateContentId"
  | "classification"
  | "envBaseline"
  | "pDevVersion"
  | "resumedFromPending"
  | "creationPreviewFingerprint";

export type HarnessProvisioningContextComparisonResult =
  | { ok: true }
  | {
      ok: false;
      mismatchedField: HarnessProvisioningContextField;
      message: string;
    };

const CONTEXT_ACTION = "preview";

export function normalizeGitHubLogin(login: string): string {
  return login.trim().toLowerCase();
}

export function normalizeRepoSlug(slug: string): string {
  const trimmed = slug.trim();
  const separator = trimmed.indexOf("/");
  if (separator === -1) {
    return trimmed.toLowerCase();
  }
  const owner = trimmed.slice(0, separator);
  const repo = trimmed.slice(separator + 1);
  return `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}`;
}

export function buildHarnessProvisioningPreviewContext(input: {
  operationId: string;
  user: { id: number; login: string };
  destination: string;
  templateDefaultBranch: string;
  templateHeadSha: string;
  templateIdentity: HarnessTemplateIdentity;
  classification: HarnessProvisioningClassification;
  envBaseline: string;
  pDevVersion: string;
  resumedFromPending: boolean;
  creationPreviewFingerprint: string | null;
}): HarnessProvisioningPreviewContext {
  return {
    operationId: input.operationId,
    authenticatedUserId: input.user.id,
    authenticatedLogin: normalizeGitHubLogin(input.user.login),
    destination: normalizeRepoSlug(input.destination),
    templateOwner: HARNESS_TEMPLATE_OWNER,
    templateRepo: HARNESS_TEMPLATE_REPO,
    templateDefaultBranch: input.templateDefaultBranch.trim(),
    templateHeadSha: input.templateHeadSha.trim(),
    templateIdentityFingerprint: fingerprintHarnessTemplateIdentity(
      input.templateIdentity,
    ),
    templateContentId: input.templateIdentity.templateContentId.trim(),
    classification: input.classification,
    envBaseline: normalizeRepoSlug(input.envBaseline || ""),
    pDevVersion: input.pDevVersion.trim(),
    resumedFromPending: input.resumedFromPending,
    creationPreviewFingerprint: input.creationPreviewFingerprint,
  };
}

export function serializeHarnessProvisioningPreviewContext(
  context: HarnessProvisioningPreviewContext,
): string {
  return JSON.stringify({
    action: CONTEXT_ACTION,
    operationId: context.operationId,
    authenticatedUserId: context.authenticatedUserId,
    authenticatedLogin: context.authenticatedLogin,
    destination: context.destination,
    templateOwner: context.templateOwner,
    templateRepo: context.templateRepo,
    templateDefaultBranch: context.templateDefaultBranch,
    templateHeadSha: context.templateHeadSha,
    templateIdentityFingerprint: context.templateIdentityFingerprint,
    templateContentId: context.templateContentId,
    classification: context.classification,
    envBaseline: context.envBaseline,
    pDevVersion: context.pDevVersion,
    resumedFromPending: context.resumedFromPending,
    creationPreviewFingerprint: context.creationPreviewFingerprint,
  });
}

export function parseHarnessProvisioningPreviewContextFingerprint(
  fingerprint: string,
): HarnessProvisioningPreviewContext | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fingerprint);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (record.action !== CONTEXT_ACTION) {
    return null;
  }
  if (typeof record.operationId !== "string" || !record.operationId.trim()) {
    return null;
  }
  if (
    typeof record.authenticatedUserId !== "number" ||
    !Number.isFinite(record.authenticatedUserId)
  ) {
    return null;
  }
  if (
    typeof record.authenticatedLogin !== "string" ||
    !record.authenticatedLogin.trim()
  ) {
    return null;
  }
  if (typeof record.destination !== "string") {
    return null;
  }
  if (record.templateOwner !== HARNESS_TEMPLATE_OWNER) {
    return null;
  }
  if (record.templateRepo !== HARNESS_TEMPLATE_REPO) {
    return null;
  }
  if (
    typeof record.templateDefaultBranch !== "string" ||
    typeof record.templateHeadSha !== "string" ||
    typeof record.templateIdentityFingerprint !== "string" ||
    typeof record.templateContentId !== "string" ||
    typeof record.classification !== "string" ||
    typeof record.envBaseline !== "string" ||
    typeof record.pDevVersion !== "string" ||
    typeof record.resumedFromPending !== "boolean"
  ) {
    return null;
  }
  if (
    record.creationPreviewFingerprint !== null &&
    typeof record.creationPreviewFingerprint !== "string"
  ) {
    return null;
  }

  return {
    operationId: record.operationId.trim(),
    authenticatedUserId: record.authenticatedUserId,
    authenticatedLogin: normalizeGitHubLogin(record.authenticatedLogin),
    destination: normalizeRepoSlug(record.destination),
    templateOwner: HARNESS_TEMPLATE_OWNER,
    templateRepo: HARNESS_TEMPLATE_REPO,
    templateDefaultBranch: record.templateDefaultBranch.trim(),
    templateHeadSha: record.templateHeadSha.trim(),
    templateIdentityFingerprint: record.templateIdentityFingerprint,
    templateContentId: record.templateContentId.trim(),
    classification: record.classification as HarnessProvisioningClassification,
    envBaseline: normalizeRepoSlug(record.envBaseline),
    pDevVersion: record.pDevVersion.trim(),
    resumedFromPending: record.resumedFromPending,
    creationPreviewFingerprint:
      record.creationPreviewFingerprint === null
        ? null
        : String(record.creationPreviewFingerprint),
  };
}

function compareField(
  field: HarnessProvisioningContextField,
  submitted: unknown,
  current: unknown,
): HarnessProvisioningContextComparisonResult | null {
  if (submitted !== current) {
    return {
      ok: false,
      mismatchedField: field,
      message: `Provisioning preview is stale (${field} changed). Retry Step 1 Continue.`,
    };
  }
  return null;
}

export function compareHarnessProvisioningPreviewContexts(
  submitted: HarnessProvisioningPreviewContext,
  current: HarnessProvisioningPreviewContext,
): HarnessProvisioningContextComparisonResult {
  const checks: Array<
    [HarnessProvisioningContextField, unknown, unknown]
  > = [
    ["operationId", submitted.operationId, current.operationId],
    [
      "authenticatedUserId",
      submitted.authenticatedUserId,
      current.authenticatedUserId,
    ],
    [
      "authenticatedLogin",
      submitted.authenticatedLogin,
      current.authenticatedLogin,
    ],
    ["destination", submitted.destination, current.destination],
    ["templateOwner", submitted.templateOwner, current.templateOwner],
    ["templateRepo", submitted.templateRepo, current.templateRepo],
    [
      "templateDefaultBranch",
      submitted.templateDefaultBranch,
      current.templateDefaultBranch,
    ],
    ["templateHeadSha", submitted.templateHeadSha, current.templateHeadSha],
    [
      "templateIdentityFingerprint",
      submitted.templateIdentityFingerprint,
      current.templateIdentityFingerprint,
    ],
    [
      "templateContentId",
      submitted.templateContentId,
      current.templateContentId,
    ],
    ["classification", submitted.classification, current.classification],
    ["envBaseline", submitted.envBaseline, current.envBaseline],
    ["pDevVersion", submitted.pDevVersion, current.pDevVersion],
    [
      "resumedFromPending",
      submitted.resumedFromPending,
      current.resumedFromPending,
    ],
    [
      "creationPreviewFingerprint",
      submitted.creationPreviewFingerprint,
      current.creationPreviewFingerprint,
    ],
  ];

  for (const [field, left, right] of checks) {
    const mismatch = compareField(field, left, right);
    if (mismatch) {
      return mismatch;
    }
  }

  return { ok: true };
}

export function validateSubmittedHarnessProvisioningFingerprint(input: {
  submittedFingerprint: string;
  currentContext: HarnessProvisioningPreviewContext;
}): HarnessProvisioningContextComparisonResult {
  const submitted = parseHarnessProvisioningPreviewContextFingerprint(
    input.submittedFingerprint,
  );
  if (!submitted) {
    return {
      ok: false,
      mismatchedField: "operationId",
      message:
        "Provisioning preview fingerprint is invalid. Retry Step 1 Continue.",
    };
  }
  return compareHarnessProvisioningPreviewContexts(
    submitted,
    input.currentContext,
  );
}

/** Test-only helper for field-level diagnostics without exposing secrets. */
export function diagnoseHarnessProvisioningFingerprintMismatch(input: {
  submittedFingerprint: string;
  currentContext: HarnessProvisioningPreviewContext;
}): HarnessProvisioningContextComparisonResult {
  return validateSubmittedHarnessProvisioningFingerprint(input);
}
