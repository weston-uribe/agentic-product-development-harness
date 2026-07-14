export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { beginObservabilitySession, installObservabilityUncaughtHandlers } =
    await import("@harness/observability/facade.js");
  const { resolveHarnessRepoRoot } = await import("@harness/gui/repo-root.js");

  try {
    const workspaceDir = resolveHarnessRepoRoot();
    await beginObservabilitySession({
      workspaceDir,
      moduleUrl: import.meta.url,
    });
    installObservabilityUncaughtHandlers();
  } catch {
    // observability must remain best-effort
  }
}

export async function onRequestError(
  error: Error,
  request: {
    path: string;
    method: string;
  },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { captureProductError } = await import("@harness/observability/facade.js");
  captureProductError({
    lifecyclePhase: "configure_route",
    productErrorCode: "configure_request_error",
    errorCategory: "unexpected",
    cause: error,
  });
}
