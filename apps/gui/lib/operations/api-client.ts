import type { OperationsBootstrapPayload, OperationsWorkflowDraft } from "@harness/operations/types";
import type { OperationsValidationResult } from "@harness/operations/types";

function buildQuery(sourceMode?: string, fixtureId?: string): string {
  const params = new URLSearchParams();
  if (sourceMode === "fixture" && fixtureId) {
    params.set("source", "fixture");
    params.set("fixture", fixtureId);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchOperationsBootstrap(input?: {
  sourceMode?: string;
  fixtureId?: string;
}): Promise<OperationsBootstrapPayload> {
  const response = await fetch(
    `/api/operations/bootstrap${buildQuery(input?.sourceMode, input?.fixtureId)}`,
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
}): Promise<{
  draft: OperationsWorkflowDraft;
  validation: OperationsValidationResult;
  message: string;
}> {
  const response = await fetch(
    `/api/operations/draft${buildQuery(input.sourceMode, input.fixtureId)}`,
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
}): Promise<OperationsBootstrapPayload> {
  const response = await fetch(
    `/api/operations/draft${buildQuery(input?.sourceMode, input?.fixtureId)}`,
    { method: "DELETE" },
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
