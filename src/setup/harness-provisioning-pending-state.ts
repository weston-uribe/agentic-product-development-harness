import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveLocalFilePaths } from "./setup-state.js";
import {
  HARNESS_TEMPLATE_OWNER,
  HARNESS_TEMPLATE_REPO,
} from "./harness-template-identity.js";

export const HARNESS_PROVISIONING_PENDING_FILE =
  ".harness/p-dev-harness-provisioning.pending.json";

export interface HarnessProvisioningPendingState {
  operationId: string;
  authenticatedUserId: number;
  authenticatedLogin: string;
  targetOwner: string;
  targetRepo: string;
  templateOwner: string;
  templateRepo: string;
  templateIdentity: string;
  templateVersion: number;
  compatibilityVersion: number;
  templateContentId: string;
  templateDefaultBranch: string;
  templateHeadSha: string;
  previewFingerprint: string;
  startedAt: string;
}

export interface PendingProvisioningValidationContext {
  operationId?: string;
  authenticatedUserId: number;
  authenticatedLogin: string;
  targetOwner: string;
  targetRepo: string;
  templateOwner: string;
  templateRepo: string;
  templateIdentity: string;
  templateVersion: number;
  compatibilityVersion: number;
  templateContentId: string;
  templateDefaultBranch: string;
  templateHeadSha: string;
  previewFingerprint?: string;
}

const workspaceMutexes = new Map<string, Promise<void>>();

export async function withHarnessProvisioningMutex<T>(
  workspaceDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = workspaceMutexes.get(workspaceDir) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  workspaceMutexes.set(workspaceDir, queued);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (workspaceMutexes.get(workspaceDir) === queued) {
      workspaceMutexes.delete(workspaceDir);
    }
  }
}

function pendingFilePath(cwd?: string): string {
  const paths = resolveLocalFilePaths(cwd);
  return path.join(paths.harnessDir, "p-dev-harness-provisioning.pending.json");
}

export async function readHarnessProvisioningPendingState(
  cwd?: string,
): Promise<HarnessProvisioningPendingState | null> {
  try {
    const raw = await readFile(pendingFilePath(cwd), "utf8");
    const parsed = JSON.parse(raw) as HarnessProvisioningPendingState;
    if (
      typeof parsed.operationId !== "string" ||
      typeof parsed.authenticatedUserId !== "number" ||
      typeof parsed.previewFingerprint !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeHarnessProvisioningPendingStateAtomic(
  state: HarnessProvisioningPendingState,
  cwd?: string,
): Promise<void> {
  const filePath = pendingFilePath(cwd);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export async function clearHarnessProvisioningPendingState(
  cwd?: string,
): Promise<void> {
  try {
    await rm(pendingFilePath(cwd), { force: true });
  } catch {
    // missing file is valid
  }
}

export function validatePendingProvisioningState(
  pending: HarnessProvisioningPendingState,
  context: PendingProvisioningValidationContext,
): { ok: true } | { ok: false; reason: string } {
  if (
    context.operationId !== undefined &&
    pending.operationId !== context.operationId
  ) {
    return {
      ok: false,
      reason: "Pending provisioning operation ID does not match.",
    };
  }
  if (pending.authenticatedUserId !== context.authenticatedUserId) {
    return {
      ok: false,
      reason: "Pending provisioning authenticated user ID does not match.",
    };
  }
  if (pending.authenticatedLogin !== context.authenticatedLogin) {
    return {
      ok: false,
      reason: "Pending provisioning authenticated login does not match.",
    };
  }
  if (pending.targetOwner !== context.targetOwner) {
    return {
      ok: false,
      reason: "Pending provisioning target owner does not match.",
    };
  }
  if (pending.targetRepo !== context.targetRepo) {
    return {
      ok: false,
      reason: "Pending provisioning target repository does not match.",
    };
  }
  if (pending.templateOwner !== context.templateOwner) {
    return {
      ok: false,
      reason: "Pending provisioning template owner does not match.",
    };
  }
  if (pending.templateRepo !== context.templateRepo) {
    return {
      ok: false,
      reason: "Pending provisioning template repository does not match.",
    };
  }
  if (pending.templateIdentity !== context.templateIdentity) {
    return {
      ok: false,
      reason: "Pending provisioning template identity does not match.",
    };
  }
  if (pending.templateVersion !== context.templateVersion) {
    return {
      ok: false,
      reason: "Pending provisioning template version does not match.",
    };
  }
  if (pending.compatibilityVersion !== context.compatibilityVersion) {
    return {
      ok: false,
      reason: "Pending provisioning compatibility version does not match.",
    };
  }
  if (pending.templateContentId !== context.templateContentId) {
    return {
      ok: false,
      reason: "Pending provisioning template content ID does not match.",
    };
  }
  if (pending.templateDefaultBranch !== context.templateDefaultBranch) {
    return {
      ok: false,
      reason: "Pending provisioning template default branch does not match.",
    };
  }
  if (pending.templateHeadSha !== context.templateHeadSha) {
    return {
      ok: false,
      reason: "Pending provisioning template HEAD SHA does not match.",
    };
  }
  if (
    context.previewFingerprint !== undefined &&
    pending.previewFingerprint !== context.previewFingerprint
  ) {
    return {
      ok: false,
      reason: "Pending provisioning creation fingerprint does not match.",
    };
  }
  return { ok: true };
}

export function buildPendingValidationContext(input: {
  operationId?: string;
  authenticatedUserId: number;
  authenticatedLogin: string;
  targetOwner: string;
  targetRepo: string;
  templateIdentity: string;
  templateVersion: number;
  compatibilityVersion: number;
  templateContentId: string;
  templateDefaultBranch: string;
  templateHeadSha: string;
  previewFingerprint?: string;
}): PendingProvisioningValidationContext {
  return {
    operationId: input.operationId,
    authenticatedUserId: input.authenticatedUserId,
    authenticatedLogin: input.authenticatedLogin,
    targetOwner: input.targetOwner,
    targetRepo: input.targetRepo,
    templateOwner: HARNESS_TEMPLATE_OWNER,
    templateRepo: HARNESS_TEMPLATE_REPO,
    templateIdentity: input.templateIdentity,
    templateVersion: input.templateVersion,
    compatibilityVersion: input.compatibilityVersion,
    templateContentId: input.templateContentId,
    templateDefaultBranch: input.templateDefaultBranch,
    templateHeadSha: input.templateHeadSha,
    previewFingerprint: input.previewFingerprint,
  };
}
