import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packageDir = path.join(repoRoot, "packages", "p-dev");

const GENERATED_PACKAGE_OUTPUT_PREFIXES = [
  "packages/p-dev/bin/",
  "packages/p-dev/dist/",
  "packages/p-dev/gui/",
  "packages/p-dev/templates/",
  "packages/p-dev/workspace-snapshot/",
] as const;

function isIgnorableDirtyPackagePath(filePath: string): boolean {
  return GENERATED_PACKAGE_OUTPUT_PREFIXES.some((prefix) =>
    filePath.startsWith(prefix),
  );
}

function isCleanEnoughForPackagePack(): boolean {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return status
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .every((line) => isIgnorableDirtyPackagePath(line.slice(3).trim()));
}

function listen(
  handler: (body: string, url: string) => void,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      handler(Buffer.concat(chunks).toString("utf8"), request.url ?? "");
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind loopback collector."));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

describe.skipIf(!isCleanEnoughForPackagePack())(
  "installed tarball observability loopback",
  () => {
    let tarballPath = "";
    let installDir = "";
    let sentryRequests: string[] = [];
    let posthogRequests: string[] = [];
    let sentryServer: Server;
    let posthogServer: Server;
    let sentryPort = 0;
    let posthogPort = 0;

    beforeAll(async () => {
      execFileSync("npm", ["run", "package:p-dev:pack"], {
        cwd: repoRoot,
        stdio: "pipe",
      });
      const packageJson = JSON.parse(
        readFileSync(path.join(packageDir, "package.json"), "utf8"),
      ) as { version: string };
      tarballPath = path.join(
        packageDir,
        `p-dev-harness-${packageJson.version}.tgz`,
      );
      installDir = await mkdtemp(
        path.join(os.tmpdir(), "p-dev-installed-tarball-"),
      );
      execFileSync(
        "npm",
        ["install", "--no-save", `file:${tarballPath}`],
        {
          cwd: installDir,
          stdio: "pipe",
        },
      );

      const sentryCollector = await listen((body) => {
        sentryRequests.push(body);
      });
      const posthogCollector = await listen((body, url) => {
        if (url.includes("/batch")) {
          posthogRequests.push(body);
        }
      });
      sentryServer = sentryCollector.server;
      posthogServer = posthogCollector.server;
      sentryPort = sentryCollector.port;
      posthogPort = posthogCollector.port;
    }, 240_000);

    afterAll(async () => {
      await Promise.all([
        new Promise<void>((resolve) => sentryServer.close(() => resolve())),
        new Promise<void>((resolve) => posthogServer.close(() => resolve())),
      ]);
      if (installDir) {
        await rm(installDir, { recursive: true, force: true });
      }
    });

    async function runInstalledHarness(
      body: string,
      env: Record<string, string>,
    ): Promise<Record<string, unknown>> {
      const scriptDir = await mkdtemp(path.join(os.tmpdir(), "p-dev-harness-run-"));
      const scriptPath = path.join(scriptDir, "installed-observability.mjs");
      await writeFile(scriptPath, body, "utf8");
      try {
        const stdout = execFileSync(process.execPath, [scriptPath], {
          cwd: scriptDir,
          env: { ...process.env, ...env },
          encoding: "utf8",
          timeout: 30_000,
        });
        return JSON.parse(stdout) as Record<string, unknown>;
      } finally {
        await rm(scriptDir, { recursive: true, force: true });
      }
    }

    it("validates production adapters from the exact packed tarball against loopback collectors", async () => {
      expect(existsSync(tarballPath)).toBe(true);
      const packageRoot = path.join(
        installDir,
        "node_modules",
        "p-dev-harness",
      );
      const facadePath = path.join(
        packageRoot,
        "dist/observability/facade.js",
      );
      expect(existsSync(facadePath)).toBe(true);

      sentryRequests = [];
      posthogRequests = [];

      const workspaceDir = await mkdtemp(
        path.join(os.tmpdir(), "p-dev-installed-home-"),
      );
      const result = await runInstalledHarness(
        `
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  beginObservabilitySession,
  writeObservabilityPreferences,
  captureAnalyticsEvent,
  captureProductError,
  flushObservability,
  shutdownObservability,
} from ${JSON.stringify(facadePath)};

const workspaceDir = ${JSON.stringify(workspaceDir)};

await beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
captureAnalyticsEvent({ type: "p_dev_setup_completed" });
captureProductError({
  lifecyclePhase: "configure_route",
  productErrorCode: "pre_consent_probe",
  errorCategory: "unexpected",
});

await writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "enabled",
  disclosureShown: true,
});
captureAnalyticsEvent({ type: "p_dev_setup_completed" });
await flushObservability(2_000);

await writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "disabled",
  errorReportingPreference: "enabled",
});
captureProductError({
  lifecyclePhase: "configure_route",
  productErrorCode: "installed_tarball_probe",
  errorCategory: "server",
});
await flushObservability(2_000);
await shutdownObservability();
process.stdout.write(JSON.stringify({ ok: true }));
`,
        {
          P_DEV_RUNTIME_MODE: "packaged",
          P_DEV_PACKAGE_VERSION: "0.3.1",
          P_DEV_HOME: workspaceDir,
          P_DEV_SENTRY_DSN: `http://public@127.0.0.1:${sentryPort}/1`,
          P_DEV_POSTHOG_PROJECT_TOKEN: "phc_installed_tarball_test",
          P_DEV_POSTHOG_HOST: `http://127.0.0.1:${posthogPort}`,
        },
      );

      await rm(workspaceDir, { recursive: true, force: true });

      expect(result.ok).toBe(true);
      expect(sentryRequests.length).toBeGreaterThanOrEqual(1);
      expect(posthogRequests.length).toBeGreaterThanOrEqual(1);

      const sentryBody = sentryRequests.join("\n");
      const posthogBody = posthogRequests.join("\n");
      expect(sentryBody).toContain("installed_tarball_probe");
      expect(sentryBody).not.toContain("pre_consent_probe");
      expect(posthogBody).toContain("phc_installed_tarball_test");
      expect(posthogBody).toContain("p_dev_session_started");
      expect(posthogBody).toContain("$process_person_profile");
      expect(posthogBody).not.toContain("ghp_");
    });
  },
);
