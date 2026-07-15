import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { OPERATIONS_DRAFT_FILENAME } from "./constants.js";
import { operationsWorkflowDraftSchema } from "./schema.js";
import type { OperationsSourceContext } from "./types.js";
import type { OperationsWorkflowDraft } from "./types.js";
import {
  deleteFixtureDraft,
  getFixtureDraft,
  saveFixtureDraft,
} from "./fixture-store.js";
import { assertWritableSourceContext } from "./source-context.js";

const SECRET_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|authorization|private[_-]?key)/i;

export interface OperationsWorkflowDraftSaveResult {
  draft: OperationsWorkflowDraft;
  path?: string;
  savedAt: string;
}

export interface OperationsDraftResetResult {
  deleted: boolean;
  path?: string;
}

export function resolveDraftPath(cwd: string): string {
  return path.join(cwd, ".harness", OPERATIONS_DRAFT_FILENAME);
}

function resolveTempDraftPath(cwd: string): string {
  return `${resolveDraftPath(cwd)}.tmp-${process.pid}-${randomUUID()}`;
}

function containsSecretLikeKeys(value: unknown, pathParts: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      containsSecretLikeKeys(entry, [...pathParts, String(index)]),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nested]) => {
        const nextPath = [...pathParts, key];
        const violations = SECRET_KEY_PATTERN.test(key) ? [nextPath.join(".")] : [];
        return [...violations, ...containsSecretLikeKeys(nested, nextPath)];
      },
    );
  }
  return [];
}

export function assertDraftHasNoSecrets(draft: unknown): void {
  const violations = containsSecretLikeKeys(draft);
  if (violations.length > 0) {
    throw new Error(
      `Draft rejected because it contains credential-like keys: ${violations.join(", ")}`,
    );
  }
}

export async function loadLiveDraft(
  cwd: string,
): Promise<OperationsWorkflowDraft | null> {
  const filePath = resolveDraftPath(cwd);
  try {
    await access(filePath);
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const result = operationsWorkflowDraftSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

export async function saveLiveDraft(
  cwd: string,
  draft: OperationsWorkflowDraft,
): Promise<OperationsWorkflowDraftSaveResult> {
  assertDraftHasNoSecrets(draft);
  const validated = operationsWorkflowDraftSchema.parse(draft);
  const harnessDir = path.join(cwd, ".harness");
  await mkdir(harnessDir, { recursive: true });

  const filePath = resolveDraftPath(cwd);
  const tempPath = resolveTempDraftPath(cwd);
  const payload = `${JSON.stringify(validated, null, 2)}\n`;

  try {
    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    draft: validated,
    path: filePath,
    savedAt: validated.updatedAt,
  };
}

export async function deleteLiveDraft(cwd: string): Promise<OperationsDraftResetResult> {
  const filePath = resolveDraftPath(cwd);
  try {
    await access(filePath);
    await rm(filePath, { force: true });
    return { deleted: true, path: filePath };
  } catch {
    return { deleted: false, path: filePath };
  }
}

export async function loadDraft(
  cwd: string,
  context: OperationsSourceContext,
): Promise<OperationsWorkflowDraft | null> {
  if (context.rejectionReason) {
    return null;
  }
  if (context.mode === "fixture") {
    return context.fixtureId ? getFixtureDraft(context.fixtureId) : null;
  }
  return loadLiveDraft(cwd);
}

export async function saveDraft(
  cwd: string,
  context: OperationsSourceContext,
  draft: OperationsWorkflowDraft,
): Promise<OperationsWorkflowDraftSaveResult> {
  const writable = assertWritableSourceContext(context);
  if (writable.mode === "fixture") {
    if (!writable.fixtureId) {
      throw new Error("Fixture id is required to save fixture drafts.");
    }
    assertDraftHasNoSecrets(draft);
    const validated = operationsWorkflowDraftSchema.parse({
      ...draft,
      sourceMode: "fixture",
      savedByRuntime: "fixture-test",
    });
    saveFixtureDraft(writable.fixtureId, validated);
    return {
      draft: validated,
      savedAt: validated.updatedAt,
    };
  }

  return saveLiveDraft(cwd, {
    ...draft,
    sourceMode: "live",
  });
}

export async function deleteDraft(
  cwd: string,
  context: OperationsSourceContext,
): Promise<OperationsDraftResetResult> {
  const writable = assertWritableSourceContext(context);
  if (writable.mode === "fixture") {
    if (!writable.fixtureId) {
      return { deleted: false };
    }
    const deleted = deleteFixtureDraft(writable.fixtureId);
    return { deleted };
  }
  return deleteLiveDraft(cwd);
}

export function summarizeDraftForReport(draft: OperationsWorkflowDraft | null): {
  present: boolean;
  schemaVersion?: number;
  draftId?: string;
  sourceMode?: string;
} {
  if (!draft) {
    return { present: false };
  }
  return {
    present: true,
    schemaVersion: draft.schemaVersion,
    draftId: draft.draftId,
    sourceMode: draft.sourceMode,
  };
}
