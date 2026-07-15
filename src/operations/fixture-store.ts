import type { OperationsWorkflowDraft } from "./types.js";

const fixtureDrafts = new Map<string, OperationsWorkflowDraft>();

export function getFixtureDraft(fixtureId: string): OperationsWorkflowDraft | null {
  return fixtureDrafts.get(fixtureId) ?? null;
}

export function saveFixtureDraft(
  fixtureId: string,
  draft: OperationsWorkflowDraft,
): OperationsWorkflowDraft {
  fixtureDrafts.set(fixtureId, draft);
  return draft;
}

export function deleteFixtureDraft(fixtureId: string): boolean {
  return fixtureDrafts.delete(fixtureId);
}

export function resetFixtureStoreForTests(): void {
  fixtureDrafts.clear();
}

export function listFixtureDraftKeysForTests(): string[] {
  return [...fixtureDrafts.keys()];
}
