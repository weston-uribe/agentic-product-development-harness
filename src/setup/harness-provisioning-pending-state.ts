import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveLocalFilePaths } from "./setup-state.js";

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

const workspaceMutexes = new Map<string, Promise<void>>();
const workspaceLocks = new Map<string, { resolve: () => void }>();

export async function withHarnessProvisioningMutex<T>(
  workspaceDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = workspaceMutexes.get(workspaceDir) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  workspaceMutexes.set(
    workspaceDir,
    previous.then(() => current),
  );
  workspaceLocks.set(workspaceDir, { resolve: release });

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (workspaceMutexes.get(workspaceDir) === current) {
      workspaceMutexes.delete(workspaceDir);
      workspaceLocks.delete(workspaceDir);
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
    return JSON.parse(raw) as HarnessProvisioningPendingState;
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

export function pendingStateMatchesOperation(
  pending: HarnessProvisioningPendingState,
  input: {
    operationId: string;
    authenticatedUserId: number;
    authenticatedLogin: string;
    targetOwner: string;
    targetRepo: string;
    templateHeadSha: string;
    previewFingerprint: string;
  },
): boolean {
  return (
    pending.operationId === input.operationId &&
    pending.authenticatedUserId === input.authenticatedUserId &&
    pending.authenticatedLogin === input.authenticatedLogin &&
    pending.targetOwner === input.targetOwner &&
    pending.targetRepo === input.targetRepo &&
    pending.templateHeadSha === input.templateHeadSha &&
    pending.previewFingerprint === input.previewFingerprint
  );
}
