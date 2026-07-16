import { afterEach, describe, expect, it, vi } from "vitest";

const facadeMocks = vi.hoisted(() => ({
  beginObservabilitySession: vi.fn(async () => null),
  captureProductError: vi.fn(),
  installObservabilityUncaughtHandlers: vi.fn(() => () => undefined),
}));

vi.mock("@harness/observability/facade.js", () => facadeMocks);
vi.mock("@harness/gui/repo-root.js", () => ({
  resolveHarnessRepoRoot: vi.fn(() => "/tmp/test-workspace"),
}));

describe("configure GUI instrumentation startup", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function loadInstrumentation() {
    return import("../../apps/gui/instrumentation.ts");
  }

  it("skips observability bootstrap when globally disabled", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.P_DEV_OBSERVABILITY_DISABLED = "1";
    process.env.P_DEV_RUNTIME_MODE = "packaged";

    const instrumentation = await loadInstrumentation();
    await instrumentation.register();
    await instrumentation.onRequestError(new Error("boom"), {
      path: "/settings/configure",
      method: "GET",
    });

    expect(facadeMocks.beginObservabilitySession).not.toHaveBeenCalled();
    expect(facadeMocks.captureProductError).not.toHaveBeenCalled();
  });

  it("skips observability bootstrap in source development runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.P_DEV_OBSERVABILITY_DISABLED;
    process.env.P_DEV_RUNTIME_MODE = "source";

    const instrumentation = await loadInstrumentation();
    await instrumentation.register();

    expect(facadeMocks.beginObservabilitySession).not.toHaveBeenCalled();
  });

  it("bootstraps observability in packaged runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.P_DEV_OBSERVABILITY_DISABLED;
    process.env.P_DEV_RUNTIME_MODE = "packaged";

    const instrumentation = await loadInstrumentation();
    await instrumentation.register();

    expect(facadeMocks.beginObservabilitySession).toHaveBeenCalledTimes(1);
    expect(facadeMocks.installObservabilityUncaughtHandlers).toHaveBeenCalledTimes(1);
  });
});

describe("observability facade adapter loading", () => {
  it("does not statically import Sentry or PostHog adapter modules", async () => {
    const facadeSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../src/observability/facade.ts", import.meta.url),
        "utf8",
      ),
    );

    expect(facadeSource).not.toMatch(
      /^import\s+\{[^}]+\}\s+from\s+"\.\/adapters\/(posthog|sentry)\.js";/m,
    );
    expect(facadeSource).toMatch(/import\(\s*"\.\/adapters\/posthog\.js"\s*\)/);
    expect(facadeSource).toMatch(/import\(\s*"\.\/adapters\/sentry\.js"\s*\)/);
  });
});
