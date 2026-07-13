import { randomUUID } from "node:crypto";
import { readHarnessPackageVersion } from "../p-dev/package-version.js";
import { isPackagedPDevRuntime } from "../p-dev/runtime-mode.js";
import { GitHubApiError } from "../github/client.js";
import { readExistingEnvFile } from "./env-merge.js";
import {
  buildHarnessManagedRepoMarker,
  HARNESS_MANAGED_REPO_MARKER_FILE,
  markersAreEquivalentForOperation,
  markerValidForExistingWorkspace,
  parseHarnessManagedRepoMarkerJson,
  validateManagedMarkerForReconnect,
} from "./harness-managed-repo-marker.js";
import {
  buildPendingValidationContext,
  clearHarnessProvisioningPendingState,
  readHarnessProvisioningPendingState,
  validatePendingProvisioningState,
  withHarnessProvisioningMutex,
  writeHarnessProvisioningPendingStateAtomic,
  type HarnessProvisioningPendingState,
} from "./harness-provisioning-pending-state.js";
import { parseRepoSlug } from "./github-remote-setup-live.js";
import type { GitHubHarnessProvisioningProvider } from "./github-remote-provider.js";
import {
  assessPackagedProvisioningTokenCapabilities,
  type GitHubTokenMetadata,
} from "./github-workflow-permissions.js";
import {
  fingerprintHarnessTemplateIdentity,
  HARNESS_DEFAULT_DESTINATION_DESCRIPTION,
  HARNESS_DEFAULT_DESTINATION_REPO_NAME,
  HARNESS_LEGACY_PUBLIC_SOURCE_REPO,
  HARNESS_TEMPLATE_IDENTITY_FILE,
  HARNESS_TEMPLATE_OWNER,
  HARNESS_TEMPLATE_REPO,
  parseHarnessTemplateIdentityJson,
} from "./harness-template-identity.js";
import { persistGithubDispatchRepository } from "./local-apply-actions.js";
import { resolveLocalFilePaths } from "./setup-state.js";

export type HarnessProvisioningState =
  | "skipped-not-packaged"
  | "skipped-source-mode"
  | "token-unavailable"
  | "token-invalid"
  | "token-unsupported"
  | "token-scope-ambiguous"
  | "token-insufficient"
  | "explicit-repo-present"
  | "explicit-packaged-repo-invalid"
  | "explicit-packaged-repo-legacy-source"
  | "template-unavailable"
  | "template-identity-missing"
  | "template-identity-invalid"
  | "template-incompatible"
  | "template-preview-ready"
  | "template-preview-stale"
  | "repo-absent"
  | "valid-existing-managed-repo"
  | "same-name-public-collision"
  | "same-name-unmanaged-collision"
  | "same-name-malformed-marker"
  | "same-name-template-only-without-pending"
  | "same-name-template-only-with-pending"
  | "repo-created-pending-verification"
  | "marker-write-pending"
  | "verified-and-persisted"
  | "created-but-persistence-failed"
  | "api-timeout-unknown"
  | "concurrent-request-recovered";

export interface HarnessRepoProvisioningSummary {
  runtimeMode: "packaged" | "source" | "unknown";
  eligible: boolean;
  state: HarnessProvisioningState;
  harnessDispatchRepo: string | null;
  authenticatedLogin: string | null;
  message: string;
  recoverable: boolean;
  connectedAutomatically: boolean;
  verifiedSavedRepo: boolean;
}

export interface HarnessRepoProvisioningPreview {
  state: HarnessProvisioningState;
  fingerprint: string;
  operationId: string;
  creationPreviewFingerprint: string | null;
  resumedFromPending: boolean;
  harnessDispatchRepo: string | null;
  authenticatedLogin: string | null;
  templateOwner: string;
  templateRepo: string;
  templateDefaultBranch: string;
  templateHeadSha: string;
  templateContentId: string | null;
  message: string;
  recoverable: boolean;
  willCreateRepository: boolean;
  tokenCapabilities: {
    tokenType: GitHubTokenMetadata["tokenType"];
    hasRepoScope: boolean;
    hasWorkflowScope: boolean;
    scopeAmbiguous: boolean;
  };
}

export interface HarnessRepoProvisioningApplyResult {
  state: HarnessProvisioningState;
  harnessDispatchRepo: string | null;
  message: string;
  recoverable: boolean;
  persisted: boolean;
}

const POST_CREATE_POLL_MAX_DELAY_MS = 8_000;

function resolvePostCreatePollConfig(): {
  timeoutMs: number;
  initialDelayMs: number;
  maxDelayMs: number;
} {
  return {
    timeoutMs: Number(process.env.HARNESS_PROVISIONING_POLL_TIMEOUT_MS ?? 60_000),
    initialDelayMs: Number(
      process.env.HARNESS_PROVISIONING_POLL_INITIAL_DELAY_MS ?? 1_000,
    ),
    maxDelayMs: Number(
      process.env.HARNESS_PROVISIONING_POLL_MAX_DELAY_MS ??
        POST_CREATE_POLL_MAX_DELAY_MS,
    ),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFingerprint(input: Record<string, unknown>): string {
  return JSON.stringify(input);
}

function destinationSlug(login: string): string {
  return `${login}/${HARNESS_DEFAULT_DESTINATION_REPO_NAME}`;
}

type TemplatePreviewOk = Extract<
  Awaited<ReturnType<typeof loadTemplatePreview>>,
  { ok: true }
>;

function buildProvisioningPreviewFingerprint(input: {
  operationId: string;
  user: { id: number; login: string };
  destination: string;
  templatePreview: TemplatePreviewOk;
  classification: DestinationClassification["kind"];
  envBaseline: string;
  pDevVersion: string;
  resumedFromPending: boolean;
  creationPreviewFingerprint: string | null;
}): string {
  return buildFingerprint({
    action: "preview",
    operationId: input.operationId,
    authenticatedUserId: input.user.id,
    authenticatedLogin: input.user.login,
    destination: input.destination,
    templateOwner: HARNESS_TEMPLATE_OWNER,
    templateRepo: HARNESS_TEMPLATE_REPO,
    templateDefaultBranch: input.templatePreview.defaultBranch,
    templateHeadSha: input.templatePreview.headSha,
    templateIdentityFingerprint: fingerprintHarnessTemplateIdentity(
      input.templatePreview.identity.identity,
    ),
    classification: input.classification,
    envBaseline: input.envBaseline,
    pDevVersion: input.pDevVersion,
    resumedFromPending: input.resumedFromPending,
    creationPreviewFingerprint: input.creationPreviewFingerprint,
  });
}

async function resolveProvisioningOperation(input: {
  cwd?: string;
  requestedOperationId?: string;
  user: { id: number; login: string };
  templatePreview: TemplatePreviewOk;
}): Promise<
  | {
      ok: true;
      operationId: string;
      resumedFromPending: boolean;
      creationPreviewFingerprint: string | null;
      pending: HarnessProvisioningPendingState | null;
    }
  | { ok: false; state: HarnessProvisioningState; message: string }
> {
  if (input.requestedOperationId) {
    const pending = await readHarnessProvisioningPendingState(input.cwd);
    if (pending && pending.operationId !== input.requestedOperationId) {
      return {
        ok: false,
        state: "concurrent-request-recovered",
        message:
          "Another provisioning operation is already in progress for this workspace.",
      };
    }
    return {
      ok: true,
      operationId: input.requestedOperationId,
      resumedFromPending: Boolean(pending),
      creationPreviewFingerprint: pending?.previewFingerprint ?? null,
      pending,
    };
  }

  const pending = await readHarnessProvisioningPendingState(input.cwd);
  if (!pending) {
    return {
      ok: true,
      operationId: randomUUID(),
      resumedFromPending: false,
      creationPreviewFingerprint: null,
      pending: null,
    };
  }

  const validation = validatePendingProvisioningState(
    pending,
    buildPendingValidationContext({
      authenticatedUserId: input.user.id,
      authenticatedLogin: input.user.login,
      targetOwner: input.user.login,
      targetRepo: HARNESS_DEFAULT_DESTINATION_REPO_NAME,
      templateIdentity: input.templatePreview.identity.identity.templateIdentity,
      templateVersion: input.templatePreview.identity.identity.templateVersion,
      compatibilityVersion:
        input.templatePreview.identity.identity.compatibilityVersion,
      templateContentId: input.templatePreview.identity.identity.templateContentId,
      templateDefaultBranch: input.templatePreview.defaultBranch,
      templateHeadSha: input.templatePreview.headSha,
    }),
  );
  if (!validation.ok) {
    return {
      ok: false,
      state: "same-name-unmanaged-collision",
      message: validation.reason,
    };
  }

  return {
    ok: true,
    operationId: pending.operationId,
    resumedFromPending: true,
    creationPreviewFingerprint: pending.previewFingerprint,
    pending,
  };
}

function pendingMatchesDestinationTemplateIdentity(
  pending: HarnessProvisioningPendingState,
  templateIdentity: {
    templateIdentity: string;
    templateVersion: number;
    compatibilityVersion: number;
    templateContentId: string;
  },
): boolean {
  return (
    pending.templateIdentity === templateIdentity.templateIdentity &&
    pending.templateVersion === templateIdentity.templateVersion &&
    pending.compatibilityVersion === templateIdentity.compatibilityVersion &&
    pending.templateContentId === templateIdentity.templateContentId
  );
}

async function loadTemplatePreview(
  provider: GitHubHarnessProvisioningProvider,
): Promise<
  | {
      ok: true;
      defaultBranch: string;
      headSha: string;
      identityRaw: string;
      identity: ReturnType<typeof parseHarnessTemplateIdentityJson> & {
        ok: true;
      };
    }
  | { ok: false; state: HarnessProvisioningState; message: string }
> {
  const template = await provider.getRepositoryMetadata(
    HARNESS_TEMPLATE_OWNER,
    HARNESS_TEMPLATE_REPO,
  );
  if (!template || !template.isTemplate) {
    return {
      ok: false,
      state: "template-unavailable",
      message:
        "The approved p-dev harness template is missing or not marked as a GitHub template.",
    };
  }

  const headSha = await provider.getRepositoryDefaultBranchHead(
    HARNESS_TEMPLATE_OWNER,
    HARNESS_TEMPLATE_REPO,
    template.defaultBranch,
  );
  const identityRaw = await provider.readRepositoryFileContent(
    HARNESS_TEMPLATE_OWNER,
    HARNESS_TEMPLATE_REPO,
    HARNESS_TEMPLATE_IDENTITY_FILE,
    headSha,
  );
  if (!identityRaw) {
    return {
      ok: false,
      state: "template-identity-missing",
      message: "Template identity file is missing from the approved template.",
    };
  }

  const parsed = parseHarnessTemplateIdentityJson(identityRaw);
  if (!parsed.ok) {
    return {
      ok: false,
      state: "template-identity-invalid",
      message: parsed.reason,
    };
  }

  return {
    ok: true,
    defaultBranch: template.defaultBranch,
    headSha,
    identityRaw,
    identity: parsed,
  };
}

async function validateExplicitPackagedRepo(
  provider: GitHubHarnessProvisioningProvider,
  repoSlug: string,
): Promise<
  | { ok: true; marker: ReturnType<typeof parseHarnessManagedRepoMarkerJson> & { ok: true } }
  | { ok: false; state: HarnessProvisioningState; message: string }
> {
  if (repoSlug === HARNESS_LEGACY_PUBLIC_SOURCE_REPO) {
    return {
      ok: false,
      state: "explicit-packaged-repo-legacy-source",
      message:
        "Saved harness repo points at the public source repo. Use advanced recovery to adopt a private managed workspace.",
    };
  }

  const { owner, repo } = parseRepoSlug(repoSlug);
  const metadata = await provider.getRepositoryMetadata(owner, repo);
  if (!metadata) {
    return {
      ok: false,
      state: "explicit-packaged-repo-invalid",
      message: `Saved harness repo ${repoSlug} is missing or inaccessible.`,
    };
  }
  if (!metadata.private || metadata.visibility !== "private") {
    return {
      ok: false,
      state: "explicit-packaged-repo-invalid",
      message: `Saved harness repo ${repoSlug} must be private in packaged mode.`,
    };
  }
  if (!metadata.permissions.admin) {
    return {
      ok: false,
      state: "explicit-packaged-repo-invalid",
      message: `Saved harness repo ${repoSlug} requires admin access.`,
    };
  }

  const markerRaw = await provider.readRepositoryFileContent(
    owner,
    repo,
    HARNESS_MANAGED_REPO_MARKER_FILE,
    metadata.defaultBranch,
  );
  if (!markerRaw) {
    return {
      ok: false,
      state: "explicit-packaged-repo-invalid",
      message: `Saved harness repo ${repoSlug} is missing a compatible managed marker.`,
    };
  }
  const marker = parseHarnessManagedRepoMarkerJson(markerRaw);
  if (!marker.ok) {
    return {
      ok: false,
      state: "explicit-packaged-repo-invalid",
      message: marker.reason,
    };
  }
  const reconnect = validateManagedMarkerForReconnect(marker.marker, repoSlug);
  if (!reconnect.ok) {
    return {
      ok: false,
      state: "explicit-packaged-repo-invalid",
      message: reconnect.reason,
    };
  }

  return { ok: true, marker };
}

type DestinationClassification =
  | { kind: "absent" }
  | { kind: "valid-managed"; repoSlug: string }
  | { kind: "public-collision" }
  | { kind: "unmanaged-collision" }
  | { kind: "malformed-marker"; reason: string }
  | { kind: "template-only-without-pending" }
  | { kind: "template-only-with-pending" };

async function classifyDestinationRepo(
  provider: GitHubHarnessProvisioningProvider,
  user: { id: number; login: string },
  cwd?: string,
  templatePreview?: TemplatePreviewOk,
): Promise<DestinationClassification> {
  const repoSlug = destinationSlug(user.login);
  const { owner, repo } = parseRepoSlug(repoSlug);
  const metadata = await provider.getRepositoryMetadata(owner, repo);
  if (!metadata) {
    return { kind: "absent" };
  }
  if (!metadata.private || metadata.visibility !== "private") {
    return { kind: "public-collision" };
  }
  if (!metadata.permissions.admin) {
    return { kind: "unmanaged-collision" };
  }

  const markerRaw = await provider.readRepositoryFileContent(
    owner,
    repo,
    HARNESS_MANAGED_REPO_MARKER_FILE,
    metadata.defaultBranch,
  );
  if (markerRaw) {
    const marker = parseHarnessManagedRepoMarkerJson(markerRaw);
    if (!marker.ok) {
      return { kind: "malformed-marker", reason: marker.reason };
    }
    const reconnect = validateManagedMarkerForReconnect(marker.marker, repoSlug);
    if (!reconnect.ok) {
      return { kind: "malformed-marker", reason: reconnect.reason };
    }
    return { kind: "valid-managed", repoSlug };
  }

  const templateRaw = await provider.readRepositoryFileContent(
    owner,
    repo,
    HARNESS_TEMPLATE_IDENTITY_FILE,
    metadata.defaultBranch,
  );
  if (templateRaw) {
    const parsedTemplate = parseHarnessTemplateIdentityJson(templateRaw);
    if (!parsedTemplate.ok) {
      return {
        kind: "malformed-marker",
        reason: `Generated repository template identity is invalid: ${parsedTemplate.reason}`,
      };
    }

    const pending = await readHarnessProvisioningPendingState(cwd);
    if (pending && templatePreview) {
      const validation = validatePendingProvisioningState(
        pending,
        buildPendingValidationContext({
          authenticatedUserId: user.id,
          authenticatedLogin: user.login,
          targetOwner: user.login,
          targetRepo: HARNESS_DEFAULT_DESTINATION_REPO_NAME,
          templateIdentity: templatePreview.identity.identity.templateIdentity,
          templateVersion: templatePreview.identity.identity.templateVersion,
          compatibilityVersion:
            templatePreview.identity.identity.compatibilityVersion,
          templateContentId: templatePreview.identity.identity.templateContentId,
          templateDefaultBranch: templatePreview.defaultBranch,
          templateHeadSha: templatePreview.headSha,
        }),
      );
      if (
        validation.ok &&
        pendingMatchesDestinationTemplateIdentity(
          pending,
          parsedTemplate.identity,
        )
      ) {
        return { kind: "template-only-with-pending" };
      }
      if (!validation.ok) {
        return { kind: "unmanaged-collision" };
      }
    }
    return { kind: "template-only-without-pending" };
  }

  return { kind: "unmanaged-collision" };
}

async function pollGeneratedRepository(
  provider: GitHubHarnessProvisioningProvider,
  repoSlug: string,
  expectedContentId: string,
): Promise<
  | { ok: true; defaultBranch: string; identity: ReturnType<typeof parseHarnessTemplateIdentityJson> & { ok: true } }
  | { ok: false; timedOut: boolean; message: string }
> {
  const { owner, repo } = parseRepoSlug(repoSlug);
  const { timeoutMs, initialDelayMs, maxDelayMs } = resolvePostCreatePollConfig();
  const started = Date.now();
  let delay = initialDelayMs;

  while (Date.now() - started < timeoutMs) {
    const metadata = await provider.getRepositoryMetadata(owner, repo);
    if (metadata?.private && metadata.permissions.admin) {
      const identityRaw = await provider.readRepositoryFileContent(
        owner,
        repo,
        HARNESS_TEMPLATE_IDENTITY_FILE,
        metadata.defaultBranch,
      );
      if (identityRaw) {
        const parsed = parseHarnessTemplateIdentityJson(identityRaw);
        if (
          parsed.ok &&
          parsed.identity.templateContentId === expectedContentId
        ) {
          return {
            ok: true,
            defaultBranch: metadata.defaultBranch,
            identity: parsed,
          };
        }
      }
    }
    await sleep(delay);
    delay = Math.min(delay * 2, maxDelayMs);
  }

  return {
    ok: false,
    timedOut: true,
    message:
      "Timed out waiting for the generated harness workspace to become ready. Retry Step 1 Continue.",
  };
}

async function finalizeManagedMarker(
  provider: GitHubHarnessProvisioningProvider,
  input: {
    repoSlug: string;
    defaultBranch: string;
    templateIdentity: ReturnType<typeof parseHarnessTemplateIdentityJson> & {
      ok: true;
    };
    templateHeadSha: string;
    operationId: string;
    user: { id: number; login: string };
    pDevVersion: string;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { owner, repo } = parseRepoSlug(input.repoSlug);
  const expectedMarker = buildHarnessManagedRepoMarker({
    repository: input.repoSlug,
    templateIdentity: input.templateIdentity.identity,
    defaultBranch: input.defaultBranch,
    sourceHeadSha: input.templateHeadSha,
    operationId: input.operationId,
    createdByGithubUserId: input.user.id,
    createdByLogin: input.user.login,
    pDevVersion: input.pDevVersion,
  });
  const existingRaw = await provider.readRepositoryFileContent(
    owner,
    repo,
    HARNESS_MANAGED_REPO_MARKER_FILE,
    input.defaultBranch,
  );
  if (existingRaw) {
    const existing = parseHarnessManagedRepoMarkerJson(existingRaw);
    if (!existing.ok) {
      return { ok: false, message: existing.reason };
    }
    if (
      markersAreEquivalentForOperation(existing.marker, expectedMarker) ||
      markerValidForExistingWorkspace(existing.marker, input.repoSlug)
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      message:
        "Existing managed marker belongs to a different operation or repository.",
    };
  }

  try {
    await provider.writeRepositoryFile({
      owner,
      repo,
      path: HARNESS_MANAGED_REPO_MARKER_FILE,
      branch: input.defaultBranch,
      message: "Initialize p-dev managed harness workspace marker",
      content: `${JSON.stringify(expectedMarker, null, 2)}\n`,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to write managed harness workspace marker.",
    };
  }
  return { ok: true };
}

export async function loadHarnessRepoProvisioningSummary(options: {
  cwd?: string;
  provider?: GitHubHarnessProvisioningProvider;
}): Promise<HarnessRepoProvisioningSummary> {
  const runtimeMode: HarnessRepoProvisioningSummary["runtimeMode"] =
    isPackagedPDevRuntime()
      ? "packaged"
      : process.env.P_DEV_RUNTIME_MODE?.trim()
        ? "source"
        : "unknown";

  const paths = resolveLocalFilePaths(options.cwd);
  const existingEnv = await readExistingEnvFile(paths);
  const explicitRepo = existingEnv?.values.GITHUB_DISPATCH_REPOSITORY?.trim();
  const pending = await readHarnessProvisioningPendingState(options.cwd);

  const base = {
    runtimeMode,
    harnessDispatchRepo: explicitRepo ?? null,
    authenticatedLogin: null as string | null,
    verifiedSavedRepo: false,
    connectedAutomatically: false,
  };

  if (!isPackagedPDevRuntime()) {
    return {
      ...base,
      eligible: false,
      state: runtimeMode === "source" ? "skipped-source-mode" : "skipped-not-packaged",
      message:
        runtimeMode === "source"
          ? "Source mode does not auto-provision a harness workspace."
          : "Packaged runtime mode is not active.",
      recoverable: false,
    };
  }

  if (pending) {
    return {
      ...base,
      eligible: true,
      state: "repo-created-pending-verification",
      message:
        "Harness workspace provisioning is incomplete. Retry Step 1 Continue to resume.",
      recoverable: true,
    };
  }

  if (!explicitRepo) {
    return {
      ...base,
      eligible: true,
      state: "repo-absent",
      message: "Packaged workspace provisioning has not completed yet.",
      recoverable: true,
    };
  }

  if (!options.provider) {
    return {
      ...base,
      eligible: true,
      state: "explicit-repo-present",
      message: `Saved harness workspace ${explicitRepo} requires server validation.`,
      recoverable: true,
    };
  }

  const capabilities = await options.provider.inspectTokenCapabilities();
  const validated = await validateExplicitPackagedRepo(
    options.provider,
    explicitRepo,
  );
  if (!validated.ok) {
    return {
      ...base,
      eligible: true,
      state: validated.state,
      authenticatedLogin: capabilities.login,
      message: validated.message,
      recoverable: true,
    };
  }

  const isDefaultDestination =
    explicitRepo === destinationSlug(capabilities.login) ||
    explicitRepo === destinationSlug(validated.marker.marker.createdByLogin ?? "");

  return {
    ...base,
    eligible: true,
    state: "verified-and-persisted",
    harnessDispatchRepo: explicitRepo,
    authenticatedLogin: capabilities.login,
    message: `Connected to validated harness workspace ${explicitRepo}.`,
    recoverable: false,
    verifiedSavedRepo: true,
    connectedAutomatically:
      isDefaultDestination && Boolean(validated.marker.marker.operationId),
  };
}

export async function previewHarnessRepoProvisioning(options: {
  cwd?: string;
  provider: GitHubHarnessProvisioningProvider;
  operationId?: string;
}): Promise<HarnessRepoProvisioningPreview> {
  if (!isPackagedPDevRuntime()) {
    return {
      state: "skipped-not-packaged",
      fingerprint: buildFingerprint({ action: "preview", skipped: true }),
      operationId: options.operationId ?? randomUUID(),
      creationPreviewFingerprint: null,
      resumedFromPending: false,
      harnessDispatchRepo: null,
      authenticatedLogin: null,
      templateOwner: HARNESS_TEMPLATE_OWNER,
      templateRepo: HARNESS_TEMPLATE_REPO,
      templateDefaultBranch: "main",
      templateHeadSha: "",
      templateContentId: null,
      message: "Packaged runtime mode is not active.",
      recoverable: false,
      willCreateRepository: false,
      tokenCapabilities: {
        tokenType: "unknown",
        hasRepoScope: false,
        hasWorkflowScope: false,
        scopeAmbiguous: true,
      },
    };
  }

  const paths = resolveLocalFilePaths(options.cwd);
  const existingEnv = await readExistingEnvFile(paths);
  const explicitRepo = existingEnv?.values.GITHUB_DISPATCH_REPOSITORY?.trim();
  const pDevVersion = readHarnessPackageVersion();

  const capabilities = await options.provider.inspectTokenCapabilities();
  const tokenMetadata: GitHubTokenMetadata = {
    login: capabilities.login,
    tokenType: capabilities.tokenType,
    oauthScopes: [],
    hasRepoScope: capabilities.hasRepoScope,
    hasWorkflowScope: capabilities.hasWorkflowScope,
  };
  const capabilityCheck = assessPackagedProvisioningTokenCapabilities({
    ...tokenMetadata,
    oauthScopes:
      capabilities.scopeAmbiguous || capabilities.tokenType !== "classic"
        ? []
        : [
            ...(capabilities.hasRepoScope ? ["repo"] : []),
            ...(capabilities.hasWorkflowScope ? ["workflow"] : []),
          ],
  });

  if (capabilities.scopeAmbiguous) {
    const operationId = options.operationId ?? randomUUID();
    return {
      state: "token-scope-ambiguous",
      fingerprint: buildFingerprint({ action: "preview", operationId }),
      operationId,
      creationPreviewFingerprint: null,
      resumedFromPending: false,
      harnessDispatchRepo: explicitRepo ?? null,
      authenticatedLogin: capabilities.login,
      templateOwner: HARNESS_TEMPLATE_OWNER,
      templateRepo: HARNESS_TEMPLATE_REPO,
      templateDefaultBranch: "main",
      templateHeadSha: "",
      templateContentId: null,
      message: capabilityCheck.ok
        ? "Token scope metadata is ambiguous."
        : capabilityCheck.message,
      recoverable: true,
      willCreateRepository: false,
      tokenCapabilities: {
        tokenType: capabilities.tokenType,
        hasRepoScope: capabilities.hasRepoScope,
        hasWorkflowScope: capabilities.hasWorkflowScope,
        scopeAmbiguous: capabilities.scopeAmbiguous,
      },
    };
  }

  if (!capabilityCheck.ok) {
    const state =
      capabilities.tokenType === "fine-grained"
        ? "token-unsupported"
        : capabilities.tokenType === "unknown"
          ? "token-scope-ambiguous"
          : "token-insufficient";
    const operationId = options.operationId ?? randomUUID();
    return {
      state,
      fingerprint: buildFingerprint({ action: "preview", operationId }),
      operationId,
      creationPreviewFingerprint: null,
      resumedFromPending: false,
      harnessDispatchRepo: explicitRepo ?? null,
      authenticatedLogin: capabilities.login,
      templateOwner: HARNESS_TEMPLATE_OWNER,
      templateRepo: HARNESS_TEMPLATE_REPO,
      templateDefaultBranch: "main",
      templateHeadSha: "",
      templateContentId: null,
      message: capabilityCheck.message,
      recoverable: true,
      willCreateRepository: false,
      tokenCapabilities: {
        tokenType: capabilities.tokenType,
        hasRepoScope: capabilities.hasRepoScope,
        hasWorkflowScope: capabilities.hasWorkflowScope,
        scopeAmbiguous: capabilities.scopeAmbiguous,
      },
    };
  }

  const user = await options.provider.resolveAuthenticatedUser();

  if (explicitRepo) {
    const operationId = options.operationId ?? randomUUID();
    const explicit = await validateExplicitPackagedRepo(
      options.provider,
      explicitRepo,
    );
    const fingerprint = buildFingerprint({
      action: "preview",
      operationId,
      authenticatedLogin: user.login,
      explicitRepo,
      pDevVersion,
    });
    if (!explicit.ok) {
      return {
        state: explicit.state,
        fingerprint,
        operationId,
        creationPreviewFingerprint: null,
        resumedFromPending: false,
        harnessDispatchRepo: explicitRepo,
        authenticatedLogin: user.login,
        templateOwner: HARNESS_TEMPLATE_OWNER,
        templateRepo: HARNESS_TEMPLATE_REPO,
        templateDefaultBranch: "main",
        templateHeadSha: "",
        templateContentId: null,
        message: explicit.message,
        recoverable: true,
        willCreateRepository: false,
        tokenCapabilities: {
          tokenType: capabilities.tokenType,
          hasRepoScope: capabilities.hasRepoScope,
          hasWorkflowScope: capabilities.hasWorkflowScope,
          scopeAmbiguous: capabilities.scopeAmbiguous,
        },
      };
    }

    return {
      state: "explicit-repo-present",
      fingerprint,
      operationId,
      creationPreviewFingerprint: null,
      resumedFromPending: false,
      harnessDispatchRepo: explicitRepo,
      authenticatedLogin: user.login,
      templateOwner: HARNESS_TEMPLATE_OWNER,
      templateRepo: HARNESS_TEMPLATE_REPO,
      templateDefaultBranch: "main",
      templateHeadSha: "",
      templateContentId: explicit.marker.marker.createdFromTemplate.templateContentId,
      message: `Reconnecting to saved harness workspace ${explicitRepo}.`,
      recoverable: false,
      willCreateRepository: false,
      tokenCapabilities: {
        tokenType: capabilities.tokenType,
        hasRepoScope: capabilities.hasRepoScope,
        hasWorkflowScope: capabilities.hasWorkflowScope,
        scopeAmbiguous: capabilities.scopeAmbiguous,
      },
    };
  }

  const templatePreview = await loadTemplatePreview(options.provider);
  if (!templatePreview.ok) {
    const operationId = options.operationId ?? randomUUID();
    return {
      state: templatePreview.state,
      fingerprint: buildFingerprint({ action: "preview", operationId }),
      operationId,
      creationPreviewFingerprint: null,
      resumedFromPending: false,
      harnessDispatchRepo: null,
      authenticatedLogin: user.login,
      templateOwner: HARNESS_TEMPLATE_OWNER,
      templateRepo: HARNESS_TEMPLATE_REPO,
      templateDefaultBranch: "main",
      templateHeadSha: "",
      templateContentId: null,
      message: templatePreview.message,
      recoverable: false,
      willCreateRepository: false,
      tokenCapabilities: {
        tokenType: capabilities.tokenType,
        hasRepoScope: capabilities.hasRepoScope,
        hasWorkflowScope: capabilities.hasWorkflowScope,
        scopeAmbiguous: capabilities.scopeAmbiguous,
      },
    };
  }

  const resolvedOperation = await resolveProvisioningOperation({
    cwd: options.cwd,
    requestedOperationId: options.operationId,
    user,
    templatePreview,
  });
  if (!resolvedOperation.ok) {
    return {
      state: resolvedOperation.state,
      fingerprint: buildFingerprint({
        action: "preview",
        conflict: resolvedOperation.message,
      }),
      operationId: options.operationId ?? randomUUID(),
      creationPreviewFingerprint: null,
      resumedFromPending: false,
      harnessDispatchRepo: null,
      authenticatedLogin: user.login,
      templateOwner: HARNESS_TEMPLATE_OWNER,
      templateRepo: HARNESS_TEMPLATE_REPO,
      templateDefaultBranch: templatePreview.defaultBranch,
      templateHeadSha: templatePreview.headSha,
      templateContentId: templatePreview.identity.identity.templateContentId,
      message: resolvedOperation.message,
      recoverable: true,
      willCreateRepository: false,
      tokenCapabilities: {
        tokenType: capabilities.tokenType,
        hasRepoScope: capabilities.hasRepoScope,
        hasWorkflowScope: capabilities.hasWorkflowScope,
        scopeAmbiguous: capabilities.scopeAmbiguous,
      },
    };
  }

  const {
    operationId,
    resumedFromPending,
    creationPreviewFingerprint,
  } = resolvedOperation;

  const destination = destinationSlug(user.login);
  const classification = await classifyDestinationRepo(
    options.provider,
    user,
    options.cwd,
    templatePreview,
  );

  let state: HarnessProvisioningState = "template-preview-ready";
  let message = `p-dev will create or reconnect ${destination} as your private harness workspace.`;
  let willCreateRepository = false;

  switch (classification.kind) {
    case "absent":
      state = "repo-absent";
      willCreateRepository = true;
      message = `p-dev will create private harness workspace ${destination} from the approved template.`;
      break;
    case "valid-managed":
      state = "valid-existing-managed-repo";
      message = `Reconnecting to existing managed harness workspace ${destination}.`;
      break;
    case "public-collision":
      state = "same-name-public-collision";
      message = `${destination} exists but is not private. p-dev will not change it automatically.`;
      break;
    case "unmanaged-collision":
      state = "same-name-unmanaged-collision";
      message = `${destination} exists without a compatible managed marker.`;
      break;
    case "malformed-marker":
      state = "same-name-malformed-marker";
      message = classification.reason;
      break;
    case "template-only-without-pending":
      state = "same-name-template-only-without-pending";
      message = `${destination} looks like an unmanaged generated repo.`;
      break;
    case "template-only-with-pending":
      state = "same-name-template-only-with-pending";
      message = `Resuming marker finalization for ${destination}.`;
      break;
  }

  const fingerprint = buildProvisioningPreviewFingerprint({
    operationId,
    user,
    destination,
    templatePreview,
    classification: classification.kind,
    envBaseline: existingEnv?.values.GITHUB_DISPATCH_REPOSITORY ?? "",
    pDevVersion,
    resumedFromPending,
    creationPreviewFingerprint,
  });

  return {
    state,
    fingerprint,
    operationId,
    creationPreviewFingerprint,
    resumedFromPending,
    harnessDispatchRepo:
      classification.kind === "valid-managed" ? destination : null,
    authenticatedLogin: user.login,
    templateOwner: HARNESS_TEMPLATE_OWNER,
    templateRepo: HARNESS_TEMPLATE_REPO,
    templateDefaultBranch: templatePreview.defaultBranch,
    templateHeadSha: templatePreview.headSha,
    templateContentId: templatePreview.identity.identity.templateContentId,
    message,
    recoverable:
      state === "repo-absent" ||
      state === "valid-existing-managed-repo" ||
      state === "same-name-template-only-with-pending",
    willCreateRepository,
    tokenCapabilities: {
      tokenType: capabilities.tokenType,
      hasRepoScope: capabilities.hasRepoScope,
      hasWorkflowScope: capabilities.hasWorkflowScope,
      scopeAmbiguous: capabilities.scopeAmbiguous,
    },
  };
}

export async function applyHarnessRepoProvisioning(options: {
  cwd?: string;
  provider: GitHubHarnessProvisioningProvider;
  confirmed: boolean;
  fingerprint: string;
  operationId: string;
}): Promise<HarnessRepoProvisioningApplyResult> {
  return withHarnessProvisioningMutex(
    resolveLocalFilePaths(options.cwd).cwd,
    async () => applyHarnessRepoProvisioningLocked(options),
  );
}

async function applyHarnessRepoProvisioningLocked(options: {
  cwd?: string;
  provider: GitHubHarnessProvisioningProvider;
  confirmed: boolean;
  fingerprint: string;
  operationId: string;
}): Promise<HarnessRepoProvisioningApplyResult> {
  const preview = await previewHarnessRepoProvisioning({
    cwd: options.cwd,
    provider: options.provider,
    operationId: options.operationId,
  });

  if (!options.confirmed) {
    return {
      state: preview.state,
      harnessDispatchRepo: preview.harnessDispatchRepo,
      message: "Confirmation is required before provisioning.",
      recoverable: true,
      persisted: false,
    };
  }

  if (preview.fingerprint !== options.fingerprint) {
    return {
      state: "template-preview-stale",
      harnessDispatchRepo: preview.harnessDispatchRepo,
      message: "Provisioning preview is stale. Retry Step 1 Continue.",
      recoverable: true,
      persisted: false,
    };
  }

  if (
    preview.state === "skipped-not-packaged" ||
    preview.state === "token-unsupported" ||
    preview.state === "token-insufficient" ||
    preview.state === "token-scope-ambiguous" ||
    preview.state === "template-unavailable" ||
    preview.state === "template-identity-missing" ||
    preview.state === "template-identity-invalid" ||
    preview.state === "template-incompatible" ||
    preview.state === "same-name-public-collision" ||
    preview.state === "same-name-unmanaged-collision" ||
    preview.state === "same-name-malformed-marker" ||
    preview.state === "same-name-template-only-without-pending" ||
    preview.state === "explicit-packaged-repo-invalid" ||
    preview.state === "explicit-packaged-repo-legacy-source"
  ) {
    return {
      state: preview.state,
      harnessDispatchRepo: preview.harnessDispatchRepo,
      message: preview.message,
      recoverable: preview.recoverable,
      persisted: false,
    };
  }

  const user = await options.provider.resolveAuthenticatedUser();
  const pDevVersion = readHarnessPackageVersion();
  const paths = resolveLocalFilePaths(options.cwd);
  const existingEnv = await readExistingEnvFile(paths);
  const explicitRepo = existingEnv?.values.GITHUB_DISPATCH_REPOSITORY?.trim();

  let targetRepo = explicitRepo ?? destinationSlug(user.login);

  if (explicitRepo) {
    const explicit = await validateExplicitPackagedRepo(
      options.provider,
      explicitRepo,
    );
    if (!explicit.ok) {
      return {
        state: explicit.state,
        harnessDispatchRepo: explicitRepo,
        message: explicit.message,
        recoverable: true,
        persisted: false,
      };
    }

    const persist = await persistGithubDispatchRepository({
      cwd: options.cwd,
      githubDispatchRepository: explicitRepo,
    });
    if (persist.outcome !== "changed" && persist.outcome !== "skipped") {
      return {
        state: "created-but-persistence-failed",
        harnessDispatchRepo: explicitRepo,
        message: persist.reason ?? "Failed to persist GITHUB_DISPATCH_REPOSITORY.",
        recoverable: true,
        persisted: false,
      };
    }
    await clearHarnessProvisioningPendingState(options.cwd);
    return {
      state: "verified-and-persisted",
      harnessDispatchRepo: explicitRepo,
      message: `Connected to saved harness workspace ${explicitRepo}.`,
      recoverable: false,
      persisted: true,
    };
  }

  const templatePreview = await loadTemplatePreview(options.provider);
  if (!templatePreview.ok) {
    return {
      state: templatePreview.state,
      harnessDispatchRepo: null,
      message: templatePreview.message,
      recoverable: false,
      persisted: false,
    };
  }

  const classification = await classifyDestinationRepo(
    options.provider,
    user,
    options.cwd,
    templatePreview,
  );

  const staleFingerprint = buildProvisioningPreviewFingerprint({
    operationId: options.operationId,
    user,
    destination: explicitRepo ?? destinationSlug(user.login),
    templatePreview,
    classification: classification.kind,
    envBaseline: existingEnv?.values.GITHUB_DISPATCH_REPOSITORY ?? "",
    pDevVersion,
    resumedFromPending: preview.resumedFromPending,
    creationPreviewFingerprint: preview.creationPreviewFingerprint,
  });
  if (staleFingerprint !== options.fingerprint) {
    return {
      state: "template-preview-stale",
      harnessDispatchRepo: null,
      message: "Template metadata changed before apply. Retry Step 1 Continue.",
      recoverable: true,
      persisted: false,
    };
  }

  const pending = await readHarnessProvisioningPendingState(options.cwd);
  if (preview.resumedFromPending) {
    if (!pending || !preview.creationPreviewFingerprint) {
      return {
        state: "same-name-template-only-without-pending",
        harnessDispatchRepo: destinationSlug(user.login),
        message:
          "Matching local pending provisioning evidence is required to resume.",
        recoverable: true,
        persisted: false,
      };
    }
    const pendingValidation = validatePendingProvisioningState(
      pending,
      buildPendingValidationContext({
        operationId: options.operationId,
        authenticatedUserId: user.id,
        authenticatedLogin: user.login,
        targetOwner: user.login,
        targetRepo: HARNESS_DEFAULT_DESTINATION_REPO_NAME,
        templateIdentity: templatePreview.identity.identity.templateIdentity,
        templateVersion: templatePreview.identity.identity.templateVersion,
        compatibilityVersion:
          templatePreview.identity.identity.compatibilityVersion,
        templateContentId: templatePreview.identity.identity.templateContentId,
        templateDefaultBranch: templatePreview.defaultBranch,
        templateHeadSha: templatePreview.headSha,
        previewFingerprint: preview.creationPreviewFingerprint,
      }),
    );
    if (!pendingValidation.ok) {
      return {
        state: "same-name-unmanaged-collision",
        harnessDispatchRepo: destinationSlug(user.login),
        message: pendingValidation.reason,
        recoverable: true,
        persisted: false,
      };
    }
  } else if (
    pending &&
    preview.state !== "valid-existing-managed-repo" &&
    classification.kind !== "valid-managed"
  ) {
    return {
      state: "concurrent-request-recovered",
      harnessDispatchRepo: null,
      message:
        "Another provisioning operation is already in progress for this workspace.",
      recoverable: true,
      persisted: false,
    };
  }

  if (classification.kind === "valid-managed") {
    targetRepo = classification.repoSlug;
  } else if (
    classification.kind === "absent" &&
    !preview.resumedFromPending
  ) {
    const creationFingerprint =
      preview.creationPreviewFingerprint ?? options.fingerprint;
    await writeHarnessProvisioningPendingStateAtomic(
      {
        operationId: options.operationId,
        authenticatedUserId: user.id,
        authenticatedLogin: user.login,
        targetOwner: user.login,
        targetRepo: HARNESS_DEFAULT_DESTINATION_REPO_NAME,
        templateOwner: HARNESS_TEMPLATE_OWNER,
        templateRepo: HARNESS_TEMPLATE_REPO,
        templateIdentity: templatePreview.identity.identity.templateIdentity,
        templateVersion: templatePreview.identity.identity.templateVersion,
        compatibilityVersion:
          templatePreview.identity.identity.compatibilityVersion,
        templateContentId: templatePreview.identity.identity.templateContentId,
        templateDefaultBranch: templatePreview.defaultBranch,
        templateHeadSha: templatePreview.headSha,
        previewFingerprint: creationFingerprint,
        startedAt: new Date().toISOString(),
      },
      options.cwd,
    );

    try {
      const created = await options.provider.createRepositoryFromTemplate({
        templateOwner: HARNESS_TEMPLATE_OWNER,
        templateRepo: HARNESS_TEMPLATE_REPO,
        owner: user.login,
        name: HARNESS_DEFAULT_DESTINATION_REPO_NAME,
        description: HARNESS_DEFAULT_DESTINATION_DESCRIPTION,
        private: true,
        includeAllBranches: false,
      });
      targetRepo = created.fullName;
    } catch (error) {
      const recovered = await classifyDestinationRepo(
        options.provider,
        user,
        options.cwd,
        templatePreview,
      );
      if (
        recovered.kind === "valid-managed" ||
        recovered.kind === "template-only-with-pending"
      ) {
        targetRepo = destinationSlug(user.login);
      } else if (error instanceof GitHubApiError && error.status === 422) {
        const retryClassification = await classifyDestinationRepo(
          options.provider,
          user,
          options.cwd,
          templatePreview,
        );
        if (retryClassification.kind === "absent") {
          return {
            state: "api-timeout-unknown",
            harnessDispatchRepo: destinationSlug(user.login),
            message:
              "Repository creation returned an ambiguous result. Retry Step 1 Continue.",
            recoverable: true,
            persisted: false,
          };
        }
        targetRepo = destinationSlug(user.login);
      } else {
        return {
          state: "api-timeout-unknown",
          harnessDispatchRepo: destinationSlug(user.login),
          message:
            error instanceof Error
              ? error.message
              : "Repository creation failed unexpectedly.",
          recoverable: true,
          persisted: false,
        };
      }
    }
  } else if (classification.kind === "template-only-with-pending") {
    targetRepo = destinationSlug(user.login);
  } else {
    return {
      state: preview.state,
      harnessDispatchRepo: preview.harnessDispatchRepo,
      message: preview.message,
      recoverable: preview.recoverable,
      persisted: false,
    };
  }

  const poll = await pollGeneratedRepository(
    options.provider,
    targetRepo,
    templatePreview.identity.identity.templateContentId,
  );
  if (!poll.ok) {
    return {
      state: poll.timedOut ? "api-timeout-unknown" : "repo-created-pending-verification",
      harnessDispatchRepo: targetRepo,
      message: poll.message,
      recoverable: true,
      persisted: false,
    };
  }

  const markerResult = await finalizeManagedMarker(options.provider, {
    repoSlug: targetRepo,
    defaultBranch: poll.defaultBranch,
    templateIdentity: poll.identity,
    templateHeadSha: pending?.templateHeadSha ?? templatePreview.headSha,
    operationId: options.operationId,
    user,
    pDevVersion,
  });
  if (!markerResult.ok) {
    return {
      state: "marker-write-pending",
      harnessDispatchRepo: targetRepo,
      message: markerResult.message,
      recoverable: true,
      persisted: false,
    };
  }

  const persist = await persistGithubDispatchRepository({
    cwd: options.cwd,
    githubDispatchRepository: targetRepo,
  });
  if (persist.outcome !== "changed" && persist.outcome !== "skipped") {
    return {
      state: "created-but-persistence-failed",
      harnessDispatchRepo: targetRepo,
      message: persist.reason ?? "Failed to persist GITHUB_DISPATCH_REPOSITORY.",
      recoverable: true,
      persisted: false,
    };
  }

  await clearHarnessProvisioningPendingState(options.cwd);
  return {
    state: "verified-and-persisted",
    harnessDispatchRepo: targetRepo,
    message: `Private harness workspace ${targetRepo} is connected.`,
    recoverable: false,
    persisted: true,
  };
}
