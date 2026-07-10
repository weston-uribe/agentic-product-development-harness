import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import {
  getDefaultEnvVarType,
  upsertVercelProjectEnvVar,
  VercelEnvVarTypeError,
} from "../../src/setup/vercel-setup-client.js";

describe("vercel-setup-client env var upsert", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("defaults secret env vars to sensitive on create", () => {
    expect(getDefaultEnvVarType("LINEAR_WEBHOOK_SECRET")).toBe("sensitive");
    expect(getDefaultEnvVarType("GITHUB_DISPATCH_TOKEN")).toBe("sensitive");
    expect(getDefaultEnvVarType("HARNESS_TEAM_KEY")).toBe("plain");
  });

  it("preserves sensitive type when updating an existing env var", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await upsertVercelProjectEnvVar("vercel-token", {
      projectId: "proj-1",
      key: "GITHUB_DISPATCH_TOKEN",
      value: "ghp_saved",
      existingEnv: {
        id: "env-1",
        key: "GITHUB_DISPATCH_TOKEN",
        type: "sensitive",
        target: ["production"],
      },
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      key: "GITHUB_DISPATCH_TOKEN",
      value: "ghp_saved",
      type: "sensitive",
      target: ["production"],
    });
  });

  it("creates env vars on the documented v10 endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({}),
    });

    await upsertVercelProjectEnvVar("vercel-token", {
      projectId: "proj-1",
      key: "HARNESS_TEAM_KEY",
      value: "WES",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/v10/projects/proj-1/env");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      key: "HARNESS_TEAM_KEY",
      value: "WES",
      type: "plain",
      target: ["production"],
    });
  });

  it("throws a targeted error when Vercel rejects sensitive type changes", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            code: "bad_request",
            message:
              "You cannot change the type of a sensitive environment variable.",
          },
        }),
    });

    await expect(
      upsertVercelProjectEnvVar("vercel-token", {
        projectId: "proj-1",
        key: "GITHUB_DISPATCH_TOKEN",
        value: "ghp_saved",
        existingEnv: {
          id: "env-1",
          key: "GITHUB_DISPATCH_TOKEN",
          type: "sensitive",
          target: ["production"],
        },
      }),
    ).rejects.toBeInstanceOf(VercelEnvVarTypeError);
  });
});
