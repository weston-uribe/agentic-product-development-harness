import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as preflightPost } from "../../apps/gui/app/api/settings/cursor-usage/preflight/route.js";
import { POST as applyPost } from "../../apps/gui/app/api/settings/cursor-usage/apply/route.js";
import { GET as configGet } from "../../apps/gui/app/api/settings/cursor-usage/config/route.js";
import { P_DEV_OBSERVABILITY_NONCE_ENV } from "../../src/observability/constants.js";

vi.mock("server-only", () => ({}));

const fixtureCsv = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/cursor-usage/sample-usage.csv",
);

function buildMultipartRequest(input: {
  host?: string;
  origin?: string;
  nonce?: string;
  body: FormData;
}): NextRequest {
  const host = input.host ?? "127.0.0.1:4317";
  const headers = new Headers({
    host,
    origin: input.origin ?? `http://${host}`,
  });
  if (input.nonce) {
    headers.set("x-p-dev-observability-nonce", input.nonce);
  }
  return new NextRequest(`http://${host}/api/settings/cursor-usage/preflight`, {
    method: "POST",
    headers,
    body: input.body,
  });
}

function buildApplyRequest(input: {
  host?: string;
  origin?: string;
  nonce?: string;
  body: Record<string, unknown>;
}): NextRequest {
  const host = input.host ?? "127.0.0.1:4317";
  const headers = new Headers({
    host,
    origin: input.origin ?? `http://${host}`,
    "content-type": "application/json",
  });
  if (input.nonce) {
    headers.set("x-p-dev-observability-nonce", input.nonce);
  }
  return new NextRequest(`http://${host}/api/settings/cursor-usage/apply`, {
    method: "POST",
    headers,
    body: JSON.stringify(input.body),
  });
}

describe("cursor usage routes", () => {
  let workspaceDir = "";
  const originalRepoRoot = process.env.HARNESS_REPO_ROOT;
  const originalGuiPort = process.env.HARNESS_GUI_PORT;
  const originalGuiHost = process.env.HARNESS_GUI_HOST;
  const originalNonceEnv = process.env[P_DEV_OBSERVABILITY_NONCE_ENV];

  beforeEach(async () => {
    workspaceDir = await mkdtemp(path.join(tmpdir(), "cursor-usage-routes-"));
    process.env.HARNESS_REPO_ROOT = workspaceDir;
    process.env.HARNESS_GUI_PORT = "4317";
    process.env.HARNESS_GUI_HOST = "127.0.0.1";
    process.env[P_DEV_OBSERVABILITY_NONCE_ENV] = "cursor-usage-test-nonce";
    await mkdir(path.join(workspaceDir, ".harness"), { recursive: true });
    await writeFile(
      path.join(workspaceDir, ".harness/config.local.json"),
      JSON.stringify({ version: 1, logDirectory: "runs", repos: [] }, null, 2),
      "utf8",
    );
  });

  afterEach(async () => {
    if (originalRepoRoot === undefined) {
      delete process.env.HARNESS_REPO_ROOT;
    } else {
      process.env.HARNESS_REPO_ROOT = originalRepoRoot;
    }
    if (originalGuiPort === undefined) {
      delete process.env.HARNESS_GUI_PORT;
    } else {
      process.env.HARNESS_GUI_PORT = originalGuiPort;
    }
    if (originalGuiHost === undefined) {
      delete process.env.HARNESS_GUI_HOST;
    } else {
      process.env.HARNESS_GUI_HOST = originalGuiHost;
    }
    if (originalNonceEnv === undefined) {
      delete process.env[P_DEV_OBSERVABILITY_NONCE_ENV];
    } else {
      process.env[P_DEV_OBSERVABILITY_NONCE_ENV] = originalNonceEnv;
    }
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("rejects cross-origin preflight requests", async () => {
    const formData = new FormData();
    formData.set("file", new File(["x"], "usage.csv", { type: "text/csv" }));
    formData.set("exportStart", "2026-07-19T00:00:00.000Z");
    formData.set("exportEnd", "2026-07-19T23:59:59.000Z");

    const response = await preflightPost(
      buildMultipartRequest({
        origin: "http://evil.example:4317",
        nonce: "cursor-usage-test-nonce",
        body: formData,
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden origin." });
  });

  it("rejects cross-origin apply requests", async () => {
    const response = await applyPost(
      buildApplyRequest({
        origin: "http://evil.example:4317",
        nonce: "cursor-usage-test-nonce",
        body: {
          importId: "00000000-0000-0000-0000-000000000001",
          fingerprint: "abc",
          confirmed: true,
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden origin." });
  });

  it("serves config without secrets", async () => {
    const response = await configGet(
      new NextRequest("http://127.0.0.1:4317/api/settings/cursor-usage/config", {
        method: "GET",
        headers: {
          host: "127.0.0.1:4317",
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toHaveProperty("namespace");
    expect(payload).toHaveProperty("adminKeyConfigured");
    expect(JSON.stringify(payload)).not.toMatch(/\bsk-/);
    expect(JSON.stringify(payload)).not.toMatch(/\bpk-/);
  });

  it("runs preflight without exposing private agent ids", async () => {
    const csv = await readFile(fixtureCsv, "utf8");
    const formData = new FormData();
    formData.set("file", new File([csv], "sample-usage.csv", { type: "text/csv" }));
    formData.set("exportStart", "2026-07-19T00:00:00.000Z");
    formData.set("exportEnd", "2026-07-19T23:59:59.000Z");

    const response = await preflightPost(
      buildMultipartRequest({
        nonce: "cursor-usage-test-nonce",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      importId: string;
      fingerprint: string;
      rows: Array<{ cloudAgentIdHash: string }>;
    };
    expect(payload.importId).toBeTruthy();
    expect(payload.fingerprint).toBeTruthy();
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("bc-agent-planning-001");
    expect(serialized).not.toContain("bc-agent-planreview-001");
    for (const row of payload.rows) {
      expect(row.cloudAgentIdHash.length).toBeLessThanOrEqual(12);
    }
  });
});
