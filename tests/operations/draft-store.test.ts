import { access, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertDraftHasNoSecrets,
  deleteDraft,
  loadDraft,
  resolveDraftPath,
  saveDraft,
  summarizeDraftForReport,
} from "../../src/operations/draft-store.js";
import { resetFixtureStoreForTests } from "../../src/operations/fixture-store.js";
import { OPERATIONS_DRAFT_FILENAME } from "../../src/operations/constants.js";
import {
  isForbiddenSnapshotPath,
} from "../../src/p-dev/workspace-snapshot-policy.js";

const sampleDraft = {
  schemaVersion: 1 as const,
  draftId: "draft-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  savedByRuntime: "source-gui" as const,
  sourceMode: "live" as const,
  baseSnapshot: {
    configFingerprint: "abc",
    statusCatalogFingerprint: "def",
    modelCatalogFingerprint: "ghi",
    workflowFingerprint: "jkl",
  },
  statusIdsOnCanvas: ["status-1"],
  rules: [],
  layout: { statusPositions: {} },
};

describe("operations draft store", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "operations-draft-"));
    resetFixtureStoreForTests();
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("saves and reloads the live draft atomically", async () => {
    await saveDraft(tempRoot, { mode: "live", fixturesEnabled: false }, sampleDraft);
    const loaded = await loadDraft(tempRoot, { mode: "live", fixturesEnabled: false });
    expect(loaded?.draftId).toBe("draft-1");
    await access(resolveDraftPath(tempRoot));
  });

  it("rejects drafts containing credential-like keys", () => {
    expect(() =>
      assertDraftHasNoSecrets({
        ...sampleDraft,
        apiKey: "secret-value",
      }),
    ).toThrow(/credential-like keys/);
  });

  it("preserves the prior valid draft when a corrupt temp write is avoided by validation", async () => {
    await saveDraft(tempRoot, { mode: "live", fixturesEnabled: false }, sampleDraft);
    await expect(
      saveDraft(
        tempRoot,
        { mode: "live", fixturesEnabled: false },
        {
          ...sampleDraft,
          updatedAt: "not-a-date",
        } as never,
      ),
    ).rejects.toThrow();
    const loaded = await loadDraft(tempRoot, { mode: "live", fixturesEnabled: false });
    expect(loaded?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("uses isolated fixture storage without touching the live draft path", async () => {
    await saveDraft(
      tempRoot,
      { mode: "fixture", fixtureId: "basic-current-workflow", fixturesEnabled: true },
      { ...sampleDraft, sourceMode: "fixture" },
    );
    await expect(access(resolveDraftPath(tempRoot))).rejects.toThrow();
    const fixtureDraft = await loadDraft(tempRoot, {
      mode: "fixture",
      fixtureId: "basic-current-workflow",
      fixturesEnabled: true,
    });
    expect(fixtureDraft?.sourceMode).toBe("fixture");
  });

  it("does not delete the live draft when resetting fixture drafts", async () => {
    await saveDraft(tempRoot, { mode: "live", fixturesEnabled: false }, sampleDraft);
    await saveDraft(
      tempRoot,
      { mode: "fixture", fixtureId: "basic-current-workflow", fixturesEnabled: true },
      { ...sampleDraft, draftId: "fixture-draft", sourceMode: "fixture" },
    );
    await deleteDraft(tempRoot, {
      mode: "fixture",
      fixtureId: "basic-current-workflow",
      fixturesEnabled: true,
    });
    const liveDraft = await loadDraft(tempRoot, { mode: "live", fixturesEnabled: false });
    expect(liveDraft?.draftId).toBe("draft-1");
  });

  it("excludes the live draft path from workspace snapshots and reports redacted metadata only", () => {
    expect(
      isForbiddenSnapshotPath(path.join(".harness", OPERATIONS_DRAFT_FILENAME)),
    ).toBe(true);
    expect(summarizeDraftForReport(sampleDraft)).toEqual({
      present: true,
      schemaVersion: 1,
      draftId: "draft-1",
      sourceMode: "live",
    });
  });
});
