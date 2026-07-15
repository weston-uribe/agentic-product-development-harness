import { execFile, execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNdjsonSentryBodyPrivacy } from "../observability/sentry-privacy-assertions.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packageDir = path.join(repoRoot, "packages", "p-dev");
const execFileAsync = promisify(execFile);
const packagePackLockPath = path.join(os.tmpdir(), "p-dev-package-pack.lockdir");

const GENERATED_PACKAGE_OUTPUT_PREFIXES = [
  "packages/p-dev/bin/",
  "packages/p-dev/dist/",
  "packages/p-dev/gui/",
  "packages/p-dev/templates/",
  "packages/p-dev/workspace-snapshot/",
] as const;

interface CollectorRequest {
  body: string;
  url: string;
  timestamp: number;
}

interface ScenarioOutput {
  state?: {
    analyticsPreference: "enabled" | "disabled" | null;
    errorReportingPreference: "enabled" | "disabled" | null;
    installationId?: string;
  };
  relaunchState?: {
    analyticsPreference: "enabled" | "disabled" | null;
    errorReportingPreference: "enabled" | "disabled" | null;
    installationId?: string;
  };
  sessionId?: string;
  relaunchSessionId?: string;
  analyticsEnabled?: boolean;
  errorEnabled?: boolean;
  afterDisableAnalyticsEnabled?: boolean;
  afterDisableErrorEnabled?: boolean;
  afterResetAnalyticsEnabled?: boolean;
  afterResetErrorEnabled?: boolean;
}

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

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquirePackagePackLock(): () => void {
  while (true) {
    try {
      mkdirSync(packagePackLockPath);
      return () => rmSync(packagePackLockPath, { recursive: true, force: true });
    } catch {
      sleepSync(250);
    }
  }
}

function tarballSourceCommit(tarballPath: string): string | null {
  if (!existsSync(tarballPath)) {
    return null;
  }
  try {
    const raw = execFileSync(
      "tar",
      ["-xOf", tarballPath, "package/workspace-snapshot/manifest.json"],
      { encoding: "utf8" },
    );
    return (JSON.parse(raw) as { sourceCommit?: string }).sourceCommit ?? null;
  } catch {
    return null;
  }
}

function packCurrentTarballIfNeeded(): string {
  const packageJson = JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8"),
  ) as { version: string };
  const nextTarballPath = path.join(
    packageDir,
    `p-dev-harness-${packageJson.version}.tgz`,
  );
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const releaseLock = acquirePackagePackLock();
  try {
    if (tarballSourceCommit(nextTarballPath) !== head) {
      execFileSync("npm", ["run", "package:p-dev:pack"], {
        cwd: repoRoot,
        stdio: "pipe",
      });
    }
  } finally {
    releaseLock();
  }
  return nextTarballPath;
}

function listen(
  onRequest: (request: CollectorRequest) => void,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      onRequest({
        body: Buffer.concat(chunks).toString("utf8"),
        url: request.url ?? "",
        timestamp: Date.now(),
      });
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

function extractPostHogEvents(requests: CollectorRequest[]): Array<{
  event?: string;
  properties?: Record<string, unknown>;
  distinct_id?: string;
}> {
  return requests.flatMap((request) => {
    try {
      const payload = JSON.parse(request.body) as {
        batch?: Array<{
          event?: string;
          properties?: Record<string, unknown>;
          distinct_id?: string;
        }>;
      };
      return payload.batch ?? [];
    } catch {
      return [];
    }
  });
}

function expectedPackagedMetadata(
  currentTarballPath: string,
): { packageVersion: string; releaseSha: string | null } {
  const packageJson = JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8"),
  ) as { version: string };
  return {
    packageVersion: packageJson.version,
    releaseSha: tarballSourceCommit(currentTarballPath),
  };
}

function assertSentryRequestPrivacy(body: string): ReturnType<typeof assertNdjsonSentryBodyPrivacy> {
  return assertNdjsonSentryBodyPrivacy(body);
}

function forbiddenFixtureValues(): string[] {
  return [
    "ghp_1234567890abcdef",
    "weston@example.com",
    "secret-repo",
    "/Users/weston/Code/secret-repo",
    "https://github.com/weston/private-repo?token=abc",
    "authorization: Bearer abc",
    "cookie=session",
    "prompt: build this",
    "function secretSource()",
    "raw arbitrary exception message",
  ];
}

describe.skipIf(!isCleanEnoughForPackagePack())(
  "installed tarball observability packaged facade loopback",
  () => {
    let tarballPath = "";
    let installDir = "";
    let packageRoot = "";
    let facadePath = "";
    let facadeUrl = "";
    let sentryRequests: CollectorRequest[] = [];
    let posthogRequests: CollectorRequest[] = [];
    let sentryServer: Server;
    let posthogServer: Server;
    let sentryPort = 0;
    let posthogPort = 0;
    const tempDirs: string[] = [];

    beforeAll(async () => {
      tarballPath = packCurrentTarballIfNeeded();
      installDir = await mkdtemp(
        path.join(os.tmpdir(), "p-dev-installed-tarball-"),
      );
      tempDirs.push(installDir);
      execFileSync(
        "npm",
        ["install", "--no-save", `file:${tarballPath}`],
        {
          cwd: installDir,
          stdio: "pipe",
        },
      );
      packageRoot = path.join(installDir, "node_modules", "p-dev-harness");
      facadePath = path.join(packageRoot, "dist/observability/facade.js");
      facadeUrl = pathToFileURL(facadePath).href;

      const sentryCollector = await listen((request) => {
        sentryRequests.push(request);
      });
      const posthogCollector = await listen((request) => {
        if (request.url.includes("/batch")) {
          posthogRequests.push(request);
        }
      });
      sentryServer = sentryCollector.server;
      posthogServer = posthogCollector.server;
      sentryPort = sentryCollector.port;
      posthogPort = posthogCollector.port;
    }, 240_000);

    afterAll(async () => {
      await Promise.all([
        sentryServer
          ? new Promise<void>((resolve) => sentryServer.close(() => resolve()))
          : Promise.resolve(),
        posthogServer
          ? new Promise<void>((resolve) => posthogServer.close(() => resolve()))
          : Promise.resolve(),
      ]);
      await Promise.all(
        tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
      );
    });

    async function makeHome(): Promise<string> {
      const dir = await mkdtemp(path.join(os.tmpdir(), "p-dev-installed-home-"));
      tempDirs.push(dir);
      return dir;
    }

    async function runScenario(
      name: string,
      workspaceDir: string,
      source: string,
    ): Promise<ScenarioOutput> {
      expect(existsSync(tarballPath)).toBe(true);
      const scriptPath = path.join(
        await mkdtemp(path.join(os.tmpdir(), `p-dev-scenario-${name}-`)),
        "scenario.mjs",
      );
      tempDirs.push(path.dirname(scriptPath));
      await writeFile(
        scriptPath,
        `
const facade = await import(${JSON.stringify(facadeUrl)});
const workspaceDir = process.env.P_DEV_HOME;
if (!workspaceDir) throw new Error("Missing P_DEV_HOME");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const result = await (async () => {
${source}
})();
console.log(JSON.stringify(result ?? {}));
process.exit(0);
`,
        "utf8",
      );

      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const key of [
        "VITEST",
        "CI",
        "GITHUB_ACTIONS",
        "VERCEL",
        "P_DEV_OBSERVABILITY_SESSION_ID",
        "P_DEV_OBSERVABILITY_NONCE",
        "DO_NOT_TRACK",
        "P_DEV_OBSERVABILITY_DISABLED",
        "P_DEV_ANALYTICS_DISABLED",
        "P_DEV_SENTRY_DISABLED",
      ]) {
        delete env[key];
      }
      env.NODE_ENV = "production";
      env.P_DEV_RUNTIME_MODE = "packaged";
      env.P_DEV_PACKAGE_VERSION = "0.3.1";
      env.P_DEV_HOME = workspaceDir;
      env.P_DEV_SENTRY_DSN = `http://public@127.0.0.1:${sentryPort}/1`;
      env.P_DEV_POSTHOG_PROJECT_TOKEN = "phc_installed_facade_test";
      env.P_DEV_POSTHOG_HOST = `http://127.0.0.1:${posthogPort}`;

      const { stdout } = await execFileAsync(process.execPath, [scriptPath], {
        cwd: installDir,
        env,
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      });
      return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as ScenarioOutput;
    }

    it("keeps undecided consent silent", async () => {
      sentryRequests = [];
      posthogRequests = [];
      const home = await makeHome();

      const output = await runScenario(
        "undecided",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
await delay(100);
const state = await facade.readObservabilityPreferences(workspaceDir);
await facade.shutdownObservability();
return { state };
`,
      );

      expect(sentryRequests).toHaveLength(0);
      expect(posthogRequests).toHaveLength(0);
      expect(output.state?.analyticsPreference).toBeNull();
      expect(output.state?.errorReportingPreference).toBeNull();
      expect(output.state?.installationId).toBeUndefined();
    });

    it("captures analytics only through the packaged facade", async () => {
      sentryRequests = [];
      posthogRequests = [];
      const home = await makeHome();

      const output = await runScenario(
        "analytics-only",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
facade.registerDisplayedConfigureStep("connect-services");
await facade.writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "enabled",
  errorReportingPreference: "disabled",
  disclosureShown: true,
});
await facade.flushObservability(5000);
const state = await facade.readObservabilityPreferences(workspaceDir);
const session = facade.getActiveObservabilitySession();
await facade.shutdownObservability();
return {
  state,
  sessionId: session?.sessionId,
};
`,
      );

      const events = extractPostHogEvents(posthogRequests);
      expect(sentryRequests).toHaveLength(0);
      expect(events.filter((event) => event.event === "p_dev_session_started")).toHaveLength(1);
      expect(events.filter((event) => event.event === "p_dev_configure_step_viewed")).toHaveLength(1);
      expect(output.state?.installationId).toMatch(/[0-9a-f-]{36}/i);
      for (const event of events) {
        expect(event.properties?.$process_person_profile).toBe(false);
        expect(Object.keys(event.properties ?? {})).not.toContain("email");
      }

      sentryRequests = [];
      posthogRequests = [];
      const relaunchOutput = await runScenario(
        "analytics-relaunch",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
const relaunchState = await facade.readObservabilityPreferences(workspaceDir);
const relaunch = facade.getActiveObservabilitySession();
await facade.shutdownObservability();
return {
  relaunchState,
  relaunchSessionId: relaunch?.sessionId,
};
`,
      );

      expect(relaunchOutput.relaunchState?.installationId).toBe(
        output.state?.installationId,
      );
    });

    it("captures error reporting only through the packaged facade", async () => {
      sentryRequests = [];
      posthogRequests = [];
      const home = await makeHome();

      const output = await runScenario(
        "error-only",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
await facade.writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "disabled",
  errorReportingPreference: "enabled",
  disclosureShown: true,
});
facade.captureProductError({
  lifecyclePhase: "configure_route",
  productErrorCode: "configure_request_error",
  errorCategory: "server",
});
await facade.flushObservability(5000);
const state = await facade.readObservabilityPreferences(workspaceDir);
const session = facade.getActiveObservabilitySession();
await facade.shutdownObservability();
return { state, sessionId: session?.sessionId };
`,
      );

      expect(sentryRequests.length).toBeGreaterThanOrEqual(1);
      expect(posthogRequests).toHaveLength(0);
      const sentryBody = sentryRequests.map((request) => request.body).join("\n");
      const events = assertSentryRequestPrivacy(sentryBody);
      expect(events).toHaveLength(1);
      const event = events[0]!;
      expect(event.tags?.product_error_code).toBe("configure_request_error");
      expect(event.tags?.session_id).toBe(output.sessionId);
      const metadata = expectedPackagedMetadata(tarballPath);
      expect(event.tags?.package_version).toBe(metadata.packageVersion);
      expect(event.tags?.release_sha).toBe(metadata.releaseSha);
      expect(event.fingerprint).toEqual([
        "configure_request_error",
        "configure_route",
      ]);
      expect(output.state?.installationId).toBeUndefined();
      expect(sentryBody).not.toContain("installationId");
    });

    it("correlates both enabled categories without leaking installation ID to Sentry", async () => {
      sentryRequests = [];
      posthogRequests = [];
      const home = await makeHome();

      const output = await runScenario(
        "both-enabled",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
await facade.writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "enabled",
  errorReportingPreference: "enabled",
  disclosureShown: true,
});
facade.captureProductError({
  lifecyclePhase: "configure_route",
  productErrorCode: "configure_request_error",
  errorCategory: "server",
});
facade.captureAnalyticsEvent({ type: "p_dev_setup_completed" });
await facade.flushObservability(5000);
const state = await facade.readObservabilityPreferences(workspaceDir);
const session = facade.getActiveObservabilitySession();
await facade.shutdownObservability();
return { state, sessionId: session?.sessionId };
`,
      );

      const posthogBody = posthogRequests.map((request) => request.body).join("\n");
      const sentryBody = sentryRequests.map((request) => request.body).join("\n");
      const sentryEvents = assertSentryRequestPrivacy(sentryBody);
      expect(sentryEvents[0]?.tags?.session_id).toBe(output.sessionId);
      expect(posthogBody).toContain(output.sessionId);
      expect(posthogBody).toContain(output.state?.installationId);
      expect(sentryBody).not.toContain(output.state?.installationId);
    });

    it("prevents subsequent analytics requests after disabling analytics", async () => {
      sentryRequests = [];
      posthogRequests = [];
      const home = await makeHome();

      const output = await runScenario(
        "disable-analytics",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
await facade.writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "enabled",
  errorReportingPreference: "enabled",
  disclosureShown: true,
});
await facade.flushObservability(5000);
await facade.writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "disabled",
});
facade.captureAnalyticsEvent({ type: "p_dev_setup_completed" });
facade.captureProductError({
  lifecyclePhase: "configure_route",
  productErrorCode: "configure_request_error",
  errorCategory: "server",
});
await facade.flushObservability(5000);
const state = await facade.readObservabilityPreferences(workspaceDir);
const afterDisableAnalyticsEnabled = facade.isAnalyticsCaptureEnabled();
const afterDisableErrorEnabled = facade.isErrorReportingCaptureEnabled();
await facade.shutdownObservability();
return { state, afterDisableAnalyticsEnabled, afterDisableErrorEnabled };
`,
      );

      const events = extractPostHogEvents(posthogRequests);
      expect(events.filter((event) => event.event === "p_dev_session_started")).toHaveLength(1);
      expect(events.filter((event) => event.event === "p_dev_setup_completed")).toHaveLength(0);
      expect(sentryRequests.length).toBeGreaterThanOrEqual(1);
      expect(output.afterDisableAnalyticsEnabled).toBe(false);
      expect(output.afterDisableErrorEnabled).toBe(true);
    });

    it("prevents subsequent Sentry requests after disabling error reporting", async () => {
      sentryRequests = [];
      posthogRequests = [];
      const home = await makeHome();

      const output = await runScenario(
        "disable-error",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
await facade.writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "enabled",
  errorReportingPreference: "enabled",
  disclosureShown: true,
});
await facade.writeObservabilityPreferences(workspaceDir, {
  errorReportingPreference: "disabled",
});
facade.captureProductError({
  lifecyclePhase: "configure_route",
  productErrorCode: "configure_request_error",
  errorCategory: "server",
});
facade.captureAnalyticsEvent({ type: "p_dev_setup_completed" });
await facade.flushObservability(5000);
const state = await facade.readObservabilityPreferences(workspaceDir);
const afterDisableAnalyticsEnabled = facade.isAnalyticsCaptureEnabled();
const afterDisableErrorEnabled = facade.isErrorReportingCaptureEnabled();
await facade.shutdownObservability();
return { state, afterDisableAnalyticsEnabled, afterDisableErrorEnabled };
`,
      );

      const events = extractPostHogEvents(posthogRequests);
      expect(sentryRequests).toHaveLength(0);
      expect(events.some((event) => event.event === "p_dev_setup_completed")).toBe(true);
      expect(output.afterDisableAnalyticsEnabled).toBe(true);
      expect(output.afterDisableErrorEnabled).toBe(false);
    });

    it("reset removes preferences and identity and blocks later transmission", async () => {
      sentryRequests = [];
      posthogRequests = [];
      const home = await makeHome();

      const output = await runScenario(
        "reset",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
await facade.writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "enabled",
  errorReportingPreference: "enabled",
  disclosureShown: true,
});
await facade.resetObservabilityState(workspaceDir);
facade.captureAnalyticsEvent({ type: "p_dev_setup_completed" });
facade.captureProductError({
  lifecyclePhase: "configure_route",
  productErrorCode: "configure_request_error",
  errorCategory: "server",
});
await facade.flushObservability(5000);
const state = await facade.readObservabilityPreferences(workspaceDir);
const afterResetAnalyticsEnabled = facade.isAnalyticsCaptureEnabled();
const afterResetErrorEnabled = facade.isErrorReportingCaptureEnabled();
await facade.shutdownObservability();
return { state, afterResetAnalyticsEnabled, afterResetErrorEnabled };
`,
      );

      const events = extractPostHogEvents(posthogRequests);
      expect(sentryRequests).toHaveLength(0);
      expect(events.some((event) => event.event === "p_dev_setup_completed")).toBe(false);
      expect(output.state?.analyticsPreference).toBeNull();
      expect(output.state?.errorReportingPreference).toBeNull();
      expect(output.state?.installationId).toBeUndefined();
      expect(output.afterResetAnalyticsEnabled).toBe(false);
      expect(output.afterResetErrorEnabled).toBe(false);
    });

    it("preserves packaged privacy filtering for Sentry and PostHog", async () => {
      sentryRequests = [];
      posthogRequests = [];
      const home = await makeHome();
      const fixture = forbiddenFixtureValues().join(" ");

      await runScenario(
        "privacy",
        home,
        `
await facade.beginObservabilitySession({
  workspaceDir,
  moduleUrl: ${JSON.stringify(facadePath)},
  env: process.env,
});
await facade.writeObservabilityPreferences(workspaceDir, {
  analyticsPreference: "enabled",
  errorReportingPreference: "enabled",
  disclosureShown: true,
});
facade.captureProductError({
  lifecyclePhase: "configure_route",
  productErrorCode: "configure_request_error",
  errorCategory: "server",
  message: ${JSON.stringify(fixture)},
  cause: new Error(${JSON.stringify(fixture)}),
});
facade.captureAnalyticsEvent({ type: "p_dev_setup_completed" });
await facade.flushObservability(5000);
await facade.shutdownObservability();
return {};
`,
      );

      const sentryBody = sentryRequests.map((request) => request.body).join("\n");
      const posthogEvents = extractPostHogEvents(posthogRequests);
      assertSentryRequestPrivacy(sentryBody);
      for (const forbidden of forbiddenFixtureValues()) {
        expect(sentryBody).not.toContain(forbidden);
        expect(JSON.stringify(posthogEvents)).not.toContain(forbidden);
      }
      for (const event of posthogEvents) {
        expect(Object.keys(event.properties ?? {}).sort()).toEqual(
          Object.keys(event.properties ?? {}).filter(
            (key) =>
              ![
                "token",
                "email",
                "repo",
                "path",
                "url",
                "authorization",
                "cookie",
                "prompt",
                "source_code",
              ].some((forbidden) => key.includes(forbidden)),
          ).sort(),
        );
      }
    });
  },
);
