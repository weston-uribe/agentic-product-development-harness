import { access, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyLocalSetupFiles,
  computeLocalSetupFingerprint,
  previewLocalSetupFiles,
} from "../../src/setup/local-apply-actions.js";
import { resolveLocalFilePaths } from "../../src/setup/setup-state.js";

const FAKE_SECRETS = {
  linearApiKey: "fake-linear-secret-value",
  cursorApiKey: "fake-cursor-secret-value",
  githubToken: "fake-github-secret-value",
};

function buildPayload(secrets = FAKE_SECRETS) {
  return {
    env: {
      harnessConfigPath: ".harness/config.local.json",
      linearApiKey: secrets.linearApiKey,
      cursorApiKey: secrets.cursorApiKey,
      githubToken: secrets.githubToken,
    },
    config: {
      linearTeamKey: "WES",
      modelId: "composer-2.5",
      repos: [
        {
          id: "target-app",
          targetRepo: "https://github.com/owner/example-target-app",
          linearProjects: "Example Target App",
          baseBranch: "dev",
          productionBranch: "main",
          previewProvider: "vercel",
          validationCommands: "npm run lint\nnpm run build",
        },
      ],
    },
  };
}

function collectText(value: unknown): string {
  return JSON.stringify(value);
}

describe("local-apply-actions", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "harness-local-apply-"));
    await writeFile(
      path.join(tempRoot, ".env.example"),
      "HARNESS_CONFIG_PATH=.harness/config.local.json\n",
      "utf8",
    );
    const harnessDir = path.join(tempRoot, ".harness");
    await mkdir(harnessDir, { recursive: true });
    await writeFile(
      path.join(harnessDir, "config.example.json"),
      JSON.stringify(
        {
          version: 1,
          repos: [
            {
              id: "target-app",
              targetRepo: "https://github.com/owner/example-target-app",
            },
          ],
          allowedTargetRepos: ["https://github.com/owner/example-target-app"],
        },
        null,
        2,
      ),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("preview does not write local files and redacts secrets", async () => {
    const payload = buildPayload();
    const preview = await previewLocalSetupFiles({
      cwd: tempRoot,
      payload,
    });
    const paths = resolveLocalFilePaths(tempRoot);
    const serialized = collectText(preview);

    expect(preview.validationError).toBeUndefined();
    expect(preview.envPreview).toContain("LINEAR_API_KEY=<redacted>");
    expect(serialized).not.toContain(FAKE_SECRETS.linearApiKey);
    await expect(access(paths.envLocal)).rejects.toThrow();
    await expect(access(paths.configLocal)).rejects.toThrow();
  });

  it("apply requires confirmation", async () => {
    const payload = buildPayload();
    const preview = await previewLocalSetupFiles({
      cwd: tempRoot,
      payload,
    });

    await expect(
      applyLocalSetupFiles({
        cwd: tempRoot,
        payload,
        confirmed: false,
        fingerprint: preview.fingerprint,
      }),
    ).rejects.toThrow(/explicit confirmation/);
  });

  it("apply rejects stale fingerprint", async () => {
    const payload = buildPayload();
    const preview = await previewLocalSetupFiles({
      cwd: tempRoot,
      payload,
    });

    await expect(
      applyLocalSetupFiles({
        cwd: tempRoot,
        payload: {
          ...payload,
          env: { ...payload.env, linearApiKey: "changed-secret" },
        },
        confirmed: true,
        fingerprint: preview.fingerprint,
      }),
    ).rejects.toThrow(/stale/);
  });

  it("apply writes only local env and config files", async () => {
    const payload = buildPayload();
    const preview = await previewLocalSetupFiles({
      cwd: tempRoot,
      payload,
    });
    const result = await applyLocalSetupFiles({
      cwd: tempRoot,
      payload,
      confirmed: true,
      fingerprint: preview.fingerprint,
    });
    const paths = resolveLocalFilePaths(tempRoot);
    const envLocal = await readFile(paths.envLocal, "utf8");
    const configLocal = await readFile(paths.configLocal, "utf8");
    const serialized = collectText(result);

    expect(result.envResult.outcome).toBe("changed");
    expect(result.configResult.outcome).toBe("changed");
    expect(envLocal).toContain(`LINEAR_API_KEY=${FAKE_SECRETS.linearApiKey}`);
    expect(configLocal).toContain('"id": "target-app"');
    expect(serialized).not.toContain(FAKE_SECRETS.linearApiKey);
    await expect(access(path.join(tempRoot, "runs"))).rejects.toThrow();
  });

  it("preserves existing secrets when apply receives blank secret fields", async () => {
    const paths = resolveLocalFilePaths(tempRoot);
    const existingLinear = "preserved-linear-secret-123";
    await writeFile(
      paths.envLocal,
      `HARNESS_CONFIG_PATH=.harness/config.local.json\nLINEAR_API_KEY=${existingLinear}\n`,
      "utf8",
    );

    const payload = buildPayload({
      linearApiKey: "",
      cursorApiKey: FAKE_SECRETS.cursorApiKey,
      githubToken: FAKE_SECRETS.githubToken,
    });
    const preview = await previewLocalSetupFiles({
      cwd: tempRoot,
      payload,
    });

    await applyLocalSetupFiles({
      cwd: tempRoot,
      payload,
      confirmed: true,
      fingerprint: preview.fingerprint,
    });

    const envLocal = await readFile(paths.envLocal, "utf8");
    expect(envLocal).toContain(`LINEAR_API_KEY=${existingLinear}`);
    expect(envLocal).toContain(`CURSOR_API_KEY=${FAKE_SECRETS.cursorApiKey}`);
  });

  it("fingerprint is stable for identical payloads", () => {
    const payload = buildPayload();
    const a = computeLocalSetupFingerprint(payload, tempRoot);
    const b = computeLocalSetupFingerprint(payload, tempRoot);
    expect(a).toBe(b);
  });
});
