import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveScopedDraftPath } from "../../src/operations/draft-store.js";
import { CANONICAL_WORKFLOW_FINGERPRINT } from "../../src/workflow/canonical-product-development-workflow.js";

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
  const { getFixtureWorkflowScopes: fixtureScopes } = await vi.importActual<
    typeof import("../../src/operations/fixtures/workflow-scopes.js")
  >("../../src/operations/fixtures/workflow-scopes.js");
  const { buildLiveWorkflowScopes: liveScopes } = await vi.importActual<
    typeof import("../../src/operations/workflow-scopes.js")
  >("../../src/operations/workflow-scopes.js");

  return {
    persistOperationsDraft: async ({
      context,
      draft,
    }: {
      context: ReturnType<typeof sourceContext.resolveOperationsSourceContext>;
      draft: Parameters<typeof draftStore.saveDraft>[2];
    }) => {
      const cwd = process.env.HARNESS_REPO_ROOT ?? process.cwd();
      const scopes =
        context.mode === "fixture" ? fixtureScopes() : liveScopes({
          version: 1,
          orchestratorMarker: "harness-orchestrator-v1",
          logDirectory: "runs",
          repos: [
            {
              id: "target-app",
              targetRepo: "https://github.com/owner/example-target-app",
              baseBranch: "main",
              productionBranch: "main",
            },
          ],
          allowedTargetRepos: ["https://github.com/owner/example-target-app"],
        });
      const saved = await draftStore.saveDraft(cwd, context, draft, scopes);
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
      const scopes =
        context.mode === "fixture" ? fixtureScopes() : liveScopes({
          version: 1,
          orchestratorMarker: "harness-orchestrator-v1",
          logDirectory: "runs",
          repos: [
            {
              id: "target-app",
              targetRepo: "https://github.com/owner/example-target-app",
              baseBranch: "main",
              productionBranch: "main",
            },
          ],
          allowedTargetRepos: ["https://github.com/owner/example-target-app"],
        });
      await draftStore.deleteDraft(cwd, context, scopes);
      return bootstrap.buildOperationsBootstrap({
        cwd,
        context,
        scopes,
        warnings: [],
      });
    },
  };
});

const sampleDraft = {
  schemaVersion: 2,
  draftId: "draft-route",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  savedByRuntime: "source-gui",
  sourceMode: "live",
  baseSnapshot: {
    configFingerprint: "abc",
    statusCatalogFingerprint: "def",
    modelCatalogFingerprint: "ghi",
    workflowFingerprint: CANONICAL_WORKFLOW_FINGERPRINT,
    scopeId: "target-app",
  },
  layout: { statusPositions: {} },
  phaseModelSettings: {},
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

  it("saves live drafts to the scoped local draft path", async () => {
    const { PUT } = await import("../../apps/gui/app/api/operations/draft/route.ts");
    const response = await PUT({
      nextUrl: new URL("http://localhost/api/operations/draft?scope=target-app"),
      json: async () => sampleDraft,
    } as never);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(JSON.stringify(payload.validation)).not.toMatch(
      /invalid-phase-model|unsupported-model-parameter/,
    );
    await access(resolveScopedDraftPath(tempRoot, "target-app"));
  });

  it("does not create a live draft file when saving fixture drafts", async () => {
    process.env.P_DEV_OPERATIONS_FIXTURES = "1";
    const { PUT } = await import("../../apps/gui/app/api/operations/draft/route.ts");
    const response = await PUT({
      nextUrl: new URL(
        "http://localhost/api/operations/draft?source=fixture&fixture=basic-current-workflow&scope=target-app",
      ),
      json: async () => ({ ...sampleDraft, sourceMode: "fixture" }),
    } as never);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(JSON.stringify(payload.validation)).not.toMatch(
      /invalid-phase-model|unsupported-model-parameter/,
    );
    await expect(access(resolveScopedDraftPath(tempRoot, "target-app"))).rejects.toThrow();
  });
});
