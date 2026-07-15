import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/gui/lib/operations-server.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/operations/bootstrap.js")
  >("../../src/operations/bootstrap.js");
  const draftStore = await vi.importActual<
    typeof import("../../src/operations/draft-store.js")
  >("../../src/operations/draft-store.js");
  const sourceContext = await vi.importActual<
    typeof import("../../src/operations/source-context.js")
  >("../../src/operations/source-context.js");

  return {
    loadOperationsBootstrap: async (request: {
      source?: string | null;
      fixture?: string | null;
    }) => {
      const context = sourceContext.resolveOperationsSourceContext(request, process.env);
      return actual.buildOperationsBootstrap({
        cwd: process.env.HARNESS_REPO_ROOT ?? process.cwd(),
        context,
        warnings: [],
      });
    },
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
      return actual.buildOperationsBootstrap({ cwd, context, warnings: [] });
    },
    sanitizeBootstrapPayload: <T>(payload: T) => payload,
  };
});

describe("operations bootstrap route", () => {
  let tempRoot = "";
  const previousFixtures = process.env.P_DEV_OPERATIONS_FIXTURES;
  const previousRepoRoot = process.env.HARNESS_REPO_ROOT;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "operations-bootstrap-route-"));
    process.env.HARNESS_REPO_ROOT = tempRoot;
  });

  afterEach(async () => {
    process.env.P_DEV_OPERATIONS_FIXTURES = previousFixtures;
    process.env.HARNESS_REPO_ROOT = previousRepoRoot;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("rejects fixture bootstrap without server opt-in", async () => {
    delete process.env.P_DEV_OPERATIONS_FIXTURES;
    const { GET } = await import("../../apps/gui/app/api/operations/bootstrap/route.ts");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/operations/bootstrap?source=fixture&fixture=branching-pr-review",
      ),
    } as never);
    const payload = await response.json();
    expect(payload.validation.errors[0]?.message).toMatch(
      /P_DEV_OPERATIONS_FIXTURES=1/,
    );
    expect(JSON.stringify(payload)).not.toMatch(/apiKey|secret/i);
  });

  it("loads fixture bootstrap when server opt-in is enabled", async () => {
    process.env.P_DEV_OPERATIONS_FIXTURES = "1";
    const { GET } = await import("../../apps/gui/app/api/operations/bootstrap/route.ts");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/operations/bootstrap?source=fixture&fixture=basic-current-workflow",
      ),
    } as never);
    const payload = await response.json();
    expect(payload.sourceMode).toBe("fixture");
    expect(payload.statuses.length).toBeGreaterThan(0);
  });
});
