import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceVercelConnectionRecovery,
  startVercelConnectionRecovery,
} from "../../src/setup/vercel-connection-recovery.js";
import { deterministicBridgeProjectName } from "../../src/setup/vercel-bridge-identity.js";
import { EXCLUDED_BRIDGE_PROJECT_NAMES } from "../../src/setup/vercel-bridge-identity.js";

describe("vercel-connection-recovery", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "vercel-recovery-"));
    await mkdir(path.join(tempRoot, ".harness"), { recursive: true });
    await writeFile(
      path.join(tempRoot, ".env.local"),
      "VERCEL_TOKEN=token\nLINEAR_API_KEY=linear\nGITHUB_TOKEN=gh\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("uses a deterministic dedicated bridge project name", () => {
    const name = deterministicBridgeProjectName(tempRoot);
    expect(name.startsWith("p-dev-bridge-")).toBe(true);
    expect(EXCLUDED_BRIDGE_PROJECT_NAMES.has(name)).toBe(false);
  });

  it("duplicate start requests reuse the same operation", async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      status: "connected",
      message: "ok",
    });
    const listTeams = vi.fn().mockResolvedValue([]);
    const reconcile = vi.fn().mockResolvedValue({
      status: "not_found",
      state: null,
      candidates: [],
      message: "none",
      reconciledFromExistingDeployment: false,
    });
    const preview = vi.fn().mockResolvedValue({
      validationError: "blocked for test",
      readiness: { ready: false, blockers: ["blocked for test"] },
      fingerprint: "fp",
    });

    const first = await startVercelConnectionRecovery({
      cwd: tempRoot,
      selectedScope: { teamName: "Personal account" },
      deps: {
        verifyToken: verifyToken as never,
        listTeams: listTeams as never,
        reconcile: reconcile as never,
        preview: preview as never,
      },
    });
    const second = await startVercelConnectionRecovery({
      cwd: tempRoot,
      selectedScope: { teamName: "Personal account" },
      deps: {
        verifyToken: verifyToken as never,
        listTeams: listTeams as never,
        reconcile: reconcile as never,
        preview: preview as never,
      },
    });

    expect(first.operation?.operationId).toBeTruthy();
    expect(second.operation?.operationId).toBe(first.operation?.operationId);
  });

  it("recovery operation survives page refresh via durable record", async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      status: "connected",
      message: "ok",
    });
    const listTeams = vi.fn().mockResolvedValue([
      { id: "team-a", name: "A", slug: "a" },
      { id: "team-b", name: "B", slug: "b" },
    ]);

    const started = await startVercelConnectionRecovery({
      cwd: tempRoot,
      deps: {
        verifyToken: verifyToken as never,
        listTeams: listTeams as never,
      },
    });

    expect(started.operation?.stage).toBe("needs_scope");
    const raw = await readFile(
      path.join(tempRoot, ".harness", "vercel-connection-recovery.json"),
      "utf8",
    );
    const persisted = JSON.parse(raw) as { operationId: string; stage: string };
    expect(persisted.operationId).toBe(started.operation?.operationId);
    expect(persisted.stage).toBe("needs_scope");
  });

  it("retry after partial project creation reuses intended name (no duplicate create)", async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      status: "connected",
      message: "ok",
    });
    const listTeams = vi.fn().mockResolvedValue([]);
    const reconcile = vi.fn().mockResolvedValue({
      status: "not_found",
      state: null,
      candidates: [],
      message: "none",
      reconciledFromExistingDeployment: false,
    });
    const apply = vi.fn().mockResolvedValue({
      status: "applied",
      verified: false,
      projectId: "prj_created",
      projectName: deterministicBridgeProjectName(tempRoot),
      writtenEnvKeys: [],
      skippedEnvKeys: [],
      linearWebhookSetup: { mode: "manual-copy", manualSteps: [] },
      signedProbeVerified: false,
      deploymentRedeployRequired: false,
      fingerprint: "fp-create",
      setupBlocked: {
        message: "Deploy failed",
        nextSteps: ["retry"],
      },
    });
    const preview = vi.fn().mockResolvedValue({
      validationError: undefined,
      readiness: { ready: true, blockers: [] },
      fingerprint: "fp-create",
    });

    const first = await startVercelConnectionRecovery({
      cwd: tempRoot,
      selectedScope: { teamName: "Personal account" },
      deps: {
        verifyToken: verifyToken as never,
        listTeams: listTeams as never,
        reconcile: reconcile as never,
        preview: preview as never,
        apply: apply as never,
      },
    });
    expect(first.operation?.stage).toBe("failed");
    expect(first.operation?.projectId).toBe("prj_created");

    const second = await advanceVercelConnectionRecovery({
      cwd: tempRoot,
      operationId: first.operation!.operationId,
      selectedScope: { teamName: "Personal account" },
      deps: {
        verifyToken: verifyToken as never,
        listTeams: listTeams as never,
        reconcile: reconcile as never,
        preview: preview as never,
        apply: apply as never,
      },
    });

    expect(apply).toHaveBeenCalled();
    const names = apply.mock.calls.map(
      (call) => call[0].plan.project?.projectName ?? call[0].plan.projectName,
    );
    expect(new Set(names).size).toBe(1);
    expect(second.operation?.intendedBridgeProjectName).toBe(
      first.operation?.intendedBridgeProjectName,
    );
  });

  it("requests scope selection when multiple Vercel teams exist", async () => {
    const result = await startVercelConnectionRecovery({
      cwd: tempRoot,
      deps: {
        verifyToken: async () =>
          ({ status: "connected", message: "ok" }) as never,
        listTeams: async () => [
          { id: "t1", name: "One", slug: "one" },
          { id: "t2", name: "Two", slug: "two" },
        ],
      },
    });
    expect(result.operation?.stage).toBe("needs_scope");
    expect(result.operation?.nextAction).toBe("select_scope");
    expect(result.operation?.scopeOptions?.length).toBeGreaterThan(1);
  });
});

describe("vercel-bridge-identity exclusions", () => {
  it("excludes weston-uribe-portfolio from bridge identity", () => {
    expect(EXCLUDED_BRIDGE_PROJECT_NAMES.has("weston-uribe-portfolio")).toBe(
      true,
    );
  });
});
