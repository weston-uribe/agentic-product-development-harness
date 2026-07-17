import { readSetupJsonResponse } from "@/lib/setup-json-response";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import type {
  AutomationSettingsPatch,
  SettingsConfigPatch,
} from "@harness/setup/settings-config-patch";
import type { LinearWorkspacePlanInput } from "@harness/setup/linear-workspace-apply";
import type {
  LinearSetupPlanInput,
  LinearSetupPreview,
} from "@harness/setup/linear-setup-apply";
import type { VercelBridgePreview } from "@harness/setup/vercel-setup-apply";
import type { LocalEnvFormInput } from "@harness/setup/local-apply-actions";

export async function previewConnectServices(env: LocalEnvFormInput) {
  const response = await fetch("/api/setup/preview-connect-services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(env),
  });
  return readSetupJsonResponse<{
    fingerprint: string;
    validationError?: string;
  }>(response, "POST /api/setup/preview-connect-services");
}

export async function applyConnectServices(input: {
  env: LocalEnvFormInput;
  fingerprint: string;
}) {
  const response = await fetch("/api/setup/apply-connect-services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      env: input.env,
      confirmed: true,
      fingerprint: input.fingerprint,
    }),
  });
  return readSetupJsonResponse<{ summary: unknown }>(
    response,
    "POST /api/setup/apply-connect-services",
  );
}

export async function verifyService(input: {
  service: "linear" | "cursor" | "github" | "vercel";
  token?: string;
}) {
  const response = await fetch("/api/setup/verify-service", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readSetupJsonResponse<{
    status: "connected" | "failed" | "unknown";
    message?: string;
    limitation?: string;
    label?: string;
  }>(response, "POST /api/setup/verify-service");
}

export async function previewLinearSetup(
  plan: Omit<LinearSetupPlanInput, "linearApiKey"> & { linearApiKey?: string },
) {
  const response = await fetch("/api/setup/preview-linear-setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });
  return readSetupJsonResponse<LinearSetupPreview>(
    response,
    "POST /api/setup/preview-linear-setup",
  );
}

export async function applyLinearWorkspace(input: {
  plan: Omit<LinearWorkspacePlanInput, "linearApiKey"> & {
    linearApiKey?: string;
  };
  fingerprint?: string;
}) {
  const response = await fetch("/api/setup/apply-linear-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan: input.plan,
      confirmed: true,
      fingerprint: input.fingerprint,
    }),
  });
  return readSetupJsonResponse<{
    apply: { verified: boolean };
    summary: unknown;
    expectedCommittedFingerprint: string;
  }>(response, "POST /api/setup/apply-linear-workspace");
}

export async function previewLinearWorkspace(
  plan: Omit<LinearWorkspacePlanInput, "linearApiKey"> & {
    linearApiKey?: string;
  },
) {
  const response = await fetch("/api/setup/preview-linear-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });
  return readSetupJsonResponse<import("@harness/setup/linear-workspace-plan").LinearWorkspacePreview>(
    response,
    "POST /api/setup/preview-linear-workspace",
  );
}

export async function applyLinearSetup(input: {
  plan: Omit<LinearSetupPlanInput, "linearApiKey"> & { linearApiKey?: string };
  fingerprint: string;
}) {
  const response = await fetch("/api/setup/apply-linear-setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan: input.plan,
      confirmed: true,
      fingerprint: input.fingerprint,
    }),
  });
  return readSetupJsonResponse<{ apply: { verified: boolean }; summary: unknown }>(
    response,
    "POST /api/setup/apply-linear-setup",
  );
}

export async function previewVercelBridge(body: Record<string, unknown>) {
  const response = await fetch("/api/setup/preview-vercel-bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readSetupJsonResponse<VercelBridgePreview>(
    response,
    "POST /api/setup/preview-vercel-bridge",
  );
}

export async function applyVercelBridge(input: {
  plan: Record<string, unknown>;
  fingerprint: string;
}) {
  const response = await fetch("/api/setup/apply-vercel-bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan: input.plan,
      confirmed: true,
      fingerprint: input.fingerprint,
    }),
  });
  return readSetupJsonResponse<{ apply: { verified?: boolean }; summary: unknown }>(
    response,
    "POST /api/setup/apply-vercel-bridge",
  );
}

export async function previewSettingsConfigPatch(patch: SettingsConfigPatch) {
  const response = await fetch("/api/settings/preview-config-patch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patch }),
  });
  return readSetupJsonResponse<{
    fingerprint: string;
    configPreview: string;
  }>(response, "POST /api/settings/preview-config-patch");
}

export async function applySettingsConfigPatch(input: {
  patch: SettingsConfigPatch;
  expectedConfigFingerprint: string;
}) {
  const response = await fetch("/api/settings/apply-config-patch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patch: input.patch,
      expectedConfigFingerprint: input.expectedConfigFingerprint,
      confirmed: true,
    }),
  });
  return readSetupJsonResponse<{
    configFingerprint: string;
  }>(response, "POST /api/settings/apply-config-patch");
}

export type { AutomationSettingsPatch, LocalConfigFormInput };
