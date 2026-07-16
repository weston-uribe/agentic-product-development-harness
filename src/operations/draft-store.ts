import {
  access,
  copyFile,
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
import { parseAndMigrateOperationsDraft } from "./draft-migration.js";
import type { OperationsSourceContext, OperationsStatusRecord } from "./types.js";
import type { OperationsWorkflowDraft } from "./types.js";
import {
  deleteFixtureDraft,
  getFixtureDraft,
  saveFixtureDraft,
} from "./fixture-store.js";
import { assertWritableSourceContext } from "./source-context.js";
import {
  deriveSafeScopeFilename,
  scopeStorageKey,
  validateRequestedScopeId,
} from "./workflow-scopes.js";
import type { OperationsWorkflowScope } from "./types.js";

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

export interface LegacyDraftMigrationResult {
  migrated: boolean;
  reviewRequired: boolean;
  message?: string;
}

export function resolveDraftPath(cwd: string): string {
  return path.join(cwd, ".harness", OPERATIONS_DRAFT_FILENAME);
}

export function resolveScopedDraftPath(cwd: string, validatedScopeId: string): string {
  const safeName = deriveSafeScopeFilename(validatedScopeId);
  return path.join(cwd, ".harness", "operations-drafts", `${safeName}.local.json`);
}

function resolveTempDraftPath(targetPath: string): string {
  return `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
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

export async function loadLiveDraft(cwd: string): Promise<OperationsWorkflowDraft | null> {
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

export async function loadScopedLiveDraft(
  cwd: string,
  validatedScopeId: string,
  statuses: OperationsStatusRecord[] = [],
): Promise<OperationsWorkflowDraft | null> {
  const filePath = resolveScopedDraftPath(cwd, validatedScopeId);
  try {
    await access(filePath);
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const migrated = parseAndMigrateOperationsDraft({ raw: parsed, statuses });
    return migrated.draft;
  } catch {
    return null;
  }
}

export async function migrateLegacyDraftIfNeeded(input: {
  cwd: string;
  scopes: OperationsWorkflowScope[];
}): Promise<LegacyDraftMigrationResult> {
  const legacyPath = resolveDraftPath(input.cwd);
  try {
    await access(legacyPath);
  } catch {
    return { migrated: false, reviewRequired: false };
  }

  if (input.scopes.length === 1) {
    const onlyScope = input.scopes[0]!;
    const scopedPath = resolveScopedDraftPath(input.cwd, onlyScope.id);
    try {
      await access(scopedPath);
      return {
        migrated: false,
        reviewRequired: false,
        message:
          "Legacy Operations draft remains at the previous path because a scoped draft already exists.",
      };
    } catch {
      await mkdir(path.dirname(scopedPath), { recursive: true });
      await copyFile(legacyPath, scopedPath);
      return {
        migrated: true,
        reviewRequired: false,
        message: `Legacy Operations draft migrated to scope "${onlyScope.id}".`,
      };
    }
  }

  return {
    migrated: false,
    reviewRequired: true,
    message:
      "A legacy Operations draft exists at the previous single-file path. Manual review is required before assigning it to a repository scope.",
  };
}

export async function saveLiveDraft(
  cwd: string,
  draft: OperationsWorkflowDraft,
  validatedScopeId: string,
): Promise<OperationsWorkflowDraftSaveResult> {
  assertDraftHasNoSecrets(draft);
  const validated = operationsWorkflowDraftSchema.parse(draft);
  const harnessDir = path.join(cwd, ".harness", "operations-drafts");
  await mkdir(harnessDir, { recursive: true });

  const filePath = resolveScopedDraftPath(cwd, validatedScopeId);
  const tempPath = resolveTempDraftPath(filePath);
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

export async function deleteScopedLiveDraft(
  cwd: string,
  validatedScopeId: string,
): Promise<OperationsDraftResetResult> {
  const filePath = resolveScopedDraftPath(cwd, validatedScopeId);
  try {
    await access(filePath);
    await rm(filePath, { force: true });
    return { deleted: true, path: filePath };
  } catch {
    return { deleted: false, path: filePath };
  }
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

function resolveScopeForContext(
  context: OperationsSourceContext,
  scopes: OperationsWorkflowScope[],
): OperationsWorkflowScope {
  const allowlist = new Map(scopes.map((scope) => [scope.id, scope]));
  const validated = validateRequestedScopeId(context.scopeId, allowlist);
  if (validated.error || !validated.scope) {
    throw new Error(validated.error ?? "Workflow scope is required.");
  }
  return validated.scope;
}

export async function loadDraft(
  cwd: string,
  context: OperationsSourceContext,
  scopes: OperationsWorkflowScope[],
  statuses: OperationsStatusRecord[] = [],
): Promise<OperationsWorkflowDraft | null> {
  if (context.rejectionReason) {
    return null;
  }

  const scope = resolveScopeForContext(context, scopes);
  const storageKey = scopeStorageKey({
    fixtureId: context.fixtureId,
    scopeId: scope.id,
  });

  if (context.mode === "fixture") {
    return getFixtureDraft(storageKey);
  }

  await migrateLegacyDraftIfNeeded({ cwd, scopes });
  return loadScopedLiveDraft(cwd, scope.id, statuses);
}

export async function saveDraft(
  cwd: string,
  context: OperationsSourceContext,
  draft: OperationsWorkflowDraft,
  scopes: OperationsWorkflowScope[],
): Promise<OperationsWorkflowDraftSaveResult> {
  const writable = assertWritableSourceContext(context);
  const scope = resolveScopeForContext(writable, scopes);

  if (writable.mode === "fixture") {
    if (!writable.fixtureId) {
      throw new Error("Fixture id is required to save fixture drafts.");
    }
    assertDraftHasNoSecrets(draft);
    const validated = operationsWorkflowDraftSchema.parse({
      ...draft,
      sourceMode: "fixture",
      savedByRuntime: "fixture-test",
      baseSnapshot: { ...draft.baseSnapshot, scopeId: scope.id },
    });
    const storageKey = scopeStorageKey({
      fixtureId: writable.fixtureId,
      scopeId: scope.id,
    });
    saveFixtureDraft(storageKey, validated);
    return {
      draft: validated,
      savedAt: validated.updatedAt,
    };
  }

  return saveLiveDraft(
    cwd,
    {
      ...draft,
      sourceMode: "live",
      baseSnapshot: { ...draft.baseSnapshot, scopeId: scope.id },
    },
    scope.id,
  );
}

export async function deleteDraft(
  cwd: string,
  context: OperationsSourceContext,
  scopes: OperationsWorkflowScope[],
): Promise<OperationsDraftResetResult> {
  const writable = assertWritableSourceContext(context);
  const scope = resolveScopeForContext(writable, scopes);

  if (writable.mode === "fixture") {
    if (!writable.fixtureId) {
      return { deleted: false };
    }
    const storageKey = scopeStorageKey({
      fixtureId: writable.fixtureId,
      scopeId: scope.id,
    });
    const deleted = deleteFixtureDraft(storageKey);
    return { deleted };
  }
  return deleteScopedLiveDraft(cwd, scope.id);
}

export function summarizeDraftForReport(draft: OperationsWorkflowDraft | null): {
  present: boolean;
  schemaVersion?: number;
  draftId?: string;
  sourceMode?: string;
  scopeId?: string;
} {
  if (!draft) {
    return { present: false };
  }
  return {
    present: true,
    schemaVersion: draft.schemaVersion,
    draftId: draft.draftId,
    sourceMode: draft.sourceMode,
    scopeId: draft.baseSnapshot.scopeId,
  };
}
