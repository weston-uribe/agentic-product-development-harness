import type { OperationsBootstrapPayload, OperationsWorkflowDraft } from "@harness/operations/types";
import type { OperationsValidationResult } from "@harness/operations/types";

function buildQuery(input?: {
  sourceMode?: string;
  fixtureId?: string;
  scopeId?: string;
}): string {
  const params = new URLSearchParams();
  if (input?.sourceMode === "fixture" && input.fixtureId) {
    params.set("source", "fixture");
    params.set("fixture", input.fixtureId);
  }
  if (input?.scopeId) {
    params.set("scope", input.scopeId);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchOperationsBootstrap(input?: {
  sourceMode?: string;
  fixtureId?: string;
  scopeId?: string;
  signal?: AbortSignal;
}): Promise<OperationsBootstrapPayload> {
  const response = await fetch(
    `/api/operations/bootstrap${buildQuery(input)}`,
    { signal: input?.signal },
  );
  if (!response.ok) {
    throw new Error("Failed to load Operations bootstrap data.");
  }
  return (await response.json()) as OperationsBootstrapPayload;
}

export async function saveOperationsDraft(input: {
  draft: OperationsWorkflowDraft;
  sourceMode?: string;
  fixtureId?: string;
  scopeId?: string;
}): Promise<{
  draft: OperationsWorkflowDraft;
  validation: OperationsValidationResult;
  message: string;
}> {
  const response = await fetch(
    `/api/operations/draft${buildQuery(input)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.draft),
    },
  );
  const payload = (await response.json()) as {
    draft?: OperationsWorkflowDraft;
    validation?: OperationsValidationResult;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to save Operations draft.");
  }
  return {
    draft: payload.draft!,
    validation: payload.validation!,
    message: payload.message ?? "Draft saved.",
  };
}

export async function resetOperationsDraft(input?: {
  sourceMode?: string;
  fixtureId?: string;
  scopeId?: string;
  signal?: AbortSignal;
}): Promise<OperationsBootstrapPayload> {
  const response = await fetch(
    `/api/operations/draft${buildQuery(input)}`,
    { method: "DELETE", signal: input?.signal },
  );
  const payload = (await response.json()) as {
    bootstrap?: OperationsBootstrapPayload;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to reset Operations draft.");
  }
  return payload.bootstrap!;
}
