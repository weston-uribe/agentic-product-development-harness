import type { OperationsWorkflowDraft } from "./types.js";

const fixtureDrafts = new Map<string, OperationsWorkflowDraft>();

export function getFixtureDraft(storageKey: string): OperationsWorkflowDraft | null {
  return fixtureDrafts.get(storageKey) ?? null;
}

export function saveFixtureDraft(
  storageKey: string,
  draft: OperationsWorkflowDraft,
): OperationsWorkflowDraft {
  fixtureDrafts.set(storageKey, draft);
  return draft;
}

export function deleteFixtureDraft(storageKey: string): boolean {
  return fixtureDrafts.delete(storageKey);
}

export function resetFixtureStoreForTests(): void {
  fixtureDrafts.clear();
}

export function listFixtureDraftKeysForTests(): string[] {
  return [...fixtureDrafts.keys()];
}
