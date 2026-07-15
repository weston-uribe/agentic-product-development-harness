function isTruthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function shouldSkipInstrumentation(): boolean {
  if (isTruthyEnv(process.env.DO_NOT_TRACK)) {
    return true;
  }
  if (isTruthyEnv(process.env.P_DEV_OBSERVABILITY_DISABLED)) {
    return true;
  }
  return process.env.P_DEV_RUNTIME_MODE?.trim().toLowerCase() !== "packaged";
}

async function dynamicHarnessImport<T>(moduleName: string): Promise<T> {
  const dynamicImport = new Function(
    "moduleName",
    "return import(moduleName)",
  ) as (moduleName: string) => Promise<T>;
  return dynamicImport(moduleName);
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (shouldSkipInstrumentation()) {
    return;
  }

  try {
    const facade = await dynamicHarnessImport<
      typeof import("@harness/observability/facade.js")
    >("@harness/observability/facade.js");
    const { resolveHarnessRepoRoot } = await dynamicHarnessImport<
      typeof import("@harness/gui/repo-root.js")
    >("@harness/gui/repo-root.js");
    const workspaceDir = resolveHarnessRepoRoot();
    await facade.beginObservabilitySession({
      workspaceDir,
      moduleUrl: import.meta.url,
    });
    facade.installObservabilityUncaughtHandlers();
  } catch {
    // observability must remain best-effort
  }
}

export async function onRequestError(
  error: Error,
  _request: {
    path: string;
    method: string;
  },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (shouldSkipInstrumentation()) {
    return;
  }

  try {
    const facade = await dynamicHarnessImport<
      typeof import("@harness/observability/facade.js")
    >("@harness/observability/facade.js");
    facade.captureProductError({
      lifecyclePhase: "configure_route",
      productErrorCode: "configure_request_error",
      errorCategory: "unexpected",
      cause: error,
    });
  } catch {
    // observability must remain best-effort
  }
}
