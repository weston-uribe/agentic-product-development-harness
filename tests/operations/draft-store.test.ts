import { access, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertDraftHasNoSecrets,
  deleteDraft,
  loadDraft,
  migrateLegacyDraftIfNeeded,
  resolveDraftPath,
  resolveScopedDraftPath,
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
    scopeId: "default",
  },
  statusIdsOnCanvas: ["status-1"],
  rules: [],
  layout: { statusPositions: {} },
};

const TEST_SCOPES = [
  { id: "default", targetRepo: "owner/repo" },
  { id: "target-app", targetRepo: "owner/target-app" },
];

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
    await saveDraft(
      tempRoot,
      { mode: "live", fixturesEnabled: false, scopeId: "default" },
      sampleDraft,
      TEST_SCOPES,
    );
    const loaded = await loadDraft(
      tempRoot,
      { mode: "live", fixturesEnabled: false, scopeId: "default" },
      TEST_SCOPES,
    );
    expect(loaded?.draftId).toBe("draft-1");
    await access(resolveScopedDraftPath(tempRoot, "default"));
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
    await saveDraft(
      tempRoot,
      { mode: "live", fixturesEnabled: false, scopeId: "default" },
      sampleDraft,
      TEST_SCOPES,
    );
    await expect(
      saveDraft(
        tempRoot,
        { mode: "live", fixturesEnabled: false, scopeId: "default" },
        {
          ...sampleDraft,
          updatedAt: "not-a-date",
        } as never,
        TEST_SCOPES,
      ),
    ).rejects.toThrow();
    const loaded = await loadDraft(
      tempRoot,
      { mode: "live", fixturesEnabled: false, scopeId: "default" },
      TEST_SCOPES,
    );
    expect(loaded?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("uses isolated fixture storage without touching the live draft path", async () => {
    await saveDraft(
      tempRoot,
      {
        mode: "fixture",
        fixtureId: "basic-current-workflow",
        fixturesEnabled: true,
        scopeId: "target-app",
      },
      { ...sampleDraft, sourceMode: "fixture" },
      TEST_SCOPES,
    );
    await expect(access(resolveScopedDraftPath(tempRoot, "default"))).rejects.toThrow();
    const fixtureDraft = await loadDraft(
      tempRoot,
      {
        mode: "fixture",
        fixtureId: "basic-current-workflow",
        fixturesEnabled: true,
        scopeId: "target-app",
      },
      TEST_SCOPES,
    );
    expect(fixtureDraft?.sourceMode).toBe("fixture");
  });

  it("does not delete the live draft when resetting fixture drafts", async () => {
    await saveDraft(
      tempRoot,
      { mode: "live", fixturesEnabled: false, scopeId: "default" },
      sampleDraft,
      TEST_SCOPES,
    );
    await saveDraft(
      tempRoot,
      {
        mode: "fixture",
        fixtureId: "basic-current-workflow",
        fixturesEnabled: true,
        scopeId: "target-app",
      },
      { ...sampleDraft, draftId: "fixture-draft", sourceMode: "fixture" },
      TEST_SCOPES,
    );
    await deleteDraft(
      tempRoot,
      {
        mode: "fixture",
        fixtureId: "basic-current-workflow",
        fixturesEnabled: true,
        scopeId: "target-app",
      },
      TEST_SCOPES,
    );
    const liveDraft = await loadDraft(
      tempRoot,
      { mode: "live", fixturesEnabled: false, scopeId: "default" },
      TEST_SCOPES,
    );
    expect(liveDraft?.draftId).toBe("draft-1");
  });

  it("auto-migrates legacy draft only when exactly one live scope exists", async () => {
    await mkdir(path.join(tempRoot, ".harness"), { recursive: true });
    await writeFile(resolveDraftPath(tempRoot), `${JSON.stringify(sampleDraft, null, 2)}\n`, "utf8");
    const result = await migrateLegacyDraftIfNeeded({
      cwd: tempRoot,
      scopes: [{ id: "default", targetRepo: "owner/repo" }],
    });
    expect(result.migrated).toBe(true);
    await access(resolveScopedDraftPath(tempRoot, "default"));
  });

  it("requires manual review when multiple scopes exist and legacy draft remains", async () => {
    await mkdir(path.join(tempRoot, ".harness"), { recursive: true });
    await writeFile(resolveDraftPath(tempRoot), `${JSON.stringify(sampleDraft, null, 2)}\n`, "utf8");
    const result = await migrateLegacyDraftIfNeeded({
      cwd: tempRoot,
      scopes: [
        { id: "a", targetRepo: "o/a" },
        { id: "b", targetRepo: "o/b" },
      ],
    });
    expect(result.migrated).toBe(false);
    expect(result.reviewRequired).toBe(true);
    await access(resolveDraftPath(tempRoot));
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
      scopeId: "default",
    });
  });
});
