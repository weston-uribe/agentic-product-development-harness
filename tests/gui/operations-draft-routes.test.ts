import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDraftPath } from "../../src/operations/draft-store.js";

vi.mock("../../apps/gui/lib/operations-server.ts", async () => {
  const draftStore = await vi.importActual<
    typeof import("../../src/operations/draft-store.js")
  >("../../src/operations/draft-store.js");
  const bootstrap = await vi.importActual<
    typeof import("../../src/operations/bootstrap.js")
  >("../../src/operations/bootstrap.js");
  const sourceContext = await vi.importActual<
    typeof import("../../src/operations/source-context.js")
  >("../../src/operations/source-context.js");

  return {
    persistOperationsDraft: async ({
      context,
      draft,
    }: {
      context: ReturnType<typeof sourceContext.resolveOperationsSourceContext>;
      draft: Parameters<typeof draftStore.saveDraft>[2];
    }) => {
      const cwd = process.env.HARNESS_REPO_ROOT ?? process.cwd();
      const saved = await draftStore.saveDraft(cwd, context, draft);
      return {
        draft: saved.draft,
        validation: { errors: [], warnings: [], infos: [] },
        summary: draftStore.summarizeDraftForReport(saved.draft),
      };
    },
    resetOperationsDraft: async (
      context: ReturnType<typeof sourceContext.resolveOperationsSourceContext>,
    ) => {
      const cwd = process.env.HARNESS_REPO_ROOT ?? process.cwd();
      await draftStore.deleteDraft(cwd, context);
      return bootstrap.buildOperationsBootstrap({ cwd, context, warnings: [] });
    },
  };
});

const sampleDraft = {
  schemaVersion: 1,
  draftId: "draft-route",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  savedByRuntime: "source-gui",
  sourceMode: "live",
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

describe("operations draft routes", () => {
  let tempRoot = "";
  const previousFixtures = process.env.P_DEV_OPERATIONS_FIXTURES;
  const previousRepoRoot = process.env.HARNESS_REPO_ROOT;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "operations-draft-route-"));
    process.env.HARNESS_REPO_ROOT = tempRoot;
  });

  afterEach(async () => {
    process.env.P_DEV_OPERATIONS_FIXTURES = previousFixtures;
    process.env.HARNESS_REPO_ROOT = previousRepoRoot;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("saves live drafts to the local draft path", async () => {
    const { PUT } = await import("../../apps/gui/app/api/operations/draft/route.ts");
    const response = await PUT({
      nextUrl: new URL("http://localhost/api/operations/draft"),
      json: async () => sampleDraft,
    } as never);
    expect(response.status).toBe(200);
    await access(resolveDraftPath(tempRoot));
  });

  it("does not create a live draft file when saving fixture drafts", async () => {
    process.env.P_DEV_OPERATIONS_FIXTURES = "1";
    const { PUT } = await import("../../apps/gui/app/api/operations/draft/route.ts");
    const response = await PUT({
      nextUrl: new URL(
        "http://localhost/api/operations/draft?source=fixture&fixture=basic-current-workflow",
      ),
      json: async () => ({ ...sampleDraft, sourceMode: "fixture" }),
    } as never);
    expect(response.status).toBe(200);
    await expect(access(resolveDraftPath(tempRoot))).rejects.toThrow();
  });
});
