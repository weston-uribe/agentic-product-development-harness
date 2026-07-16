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

function resolveWorkspaceDir(): string {
  return (
    process.env.P_DEV_HOME?.trim() ||
    process.env.HARNESS_REPO_ROOT?.trim() ||
    process.cwd()
  );
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (shouldSkipInstrumentation()) {
    return;
  }

  try {
    const {
      beginObservabilitySession,
      installObservabilityUncaughtHandlers,
    } = await import(
      /* webpackIgnore: true */
      "@harness/observability/facade.js"
    );
    await beginObservabilitySession({
      workspaceDir: resolveWorkspaceDir(),
      moduleUrl: import.meta.url,
    });
    installObservabilityUncaughtHandlers();
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
    const { captureProductError } = await import(
      /* webpackIgnore: true */
      "@harness/observability/facade.js"
    );
    captureProductError({
      lifecyclePhase: "configure_route",
      productErrorCode: "configure_request_error",
      errorCategory: "unexpected",
      cause: error,
    });
  } catch {
    // observability must remain best-effort
  }
}
