import {
  loadSecretFromEnvLocal,
  verifySetupService,
  type SetupServiceName,
  type ServiceVerificationResult,
} from "./service-verification.js";
import type { CredentialHealthStatus } from "./workspace-health.js";
import { credentialHealthLabel } from "./workspace-health.js";

export type SavedCredentialHealth = {
  status: CredentialHealthStatus;
  message?: string;
  label?: string;
  limitation?: string;
  checkedAt?: string;
};

export type SavedCredentialHealthMap = Record<
  "LINEAR_API_KEY" | "CURSOR_API_KEY" | "GITHUB_TOKEN" | "VERCEL_TOKEN",
  SavedCredentialHealth
>;

const SERVICE_KEYS = [
  "LINEAR_API_KEY",
  "CURSOR_API_KEY",
  "GITHUB_TOKEN",
  "VERCEL_TOKEN",
] as const;

const KEY_TO_SERVICE: Record<(typeof SERVICE_KEYS)[number], SetupServiceName> = {
  LINEAR_API_KEY: "linear",
  CURSOR_API_KEY: "cursor",
  GITHUB_TOKEN: "github",
  VERCEL_TOKEN: "vercel",
};

/**
 * Map a verifySetupService failure into typed credential health.
 * Unauthorized must not be collapsed into a generic failed badge.
 */
export function classifyVerificationFailure(
  result: ServiceVerificationResult,
): Exclude<CredentialHealthStatus, "missing" | "checking" | "connected"> {
  const message = result.message ?? "";
  if (
    /unauthorized|rejected this token|rejected this api key|401|403|forbidden/i.test(
      message,
    )
  ) {
    return "unauthorized";
  }
  return "unknown";
}

export function initialCredentialHealthFromPresence(
  present: boolean,
): SavedCredentialHealth {
  if (!present) {
    return {
      status: "missing",
      message: `${credentialHealthLabel("missing")}.`,
    };
  }
  return {
    status: "checking",
    message: "Checking saved credential…",
  };
}

export async function verifySavedCredentialHealth(options: {
  cwd?: string;
  key: (typeof SERVICE_KEYS)[number];
}): Promise<SavedCredentialHealth> {
  const saved = await loadSecretFromEnvLocal({
    cwd: options.cwd,
    key: options.key,
  });
  if (!saved) {
    return {
      status: "missing",
      message: `${options.key} is not saved.`,
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    const result = await verifySetupService({
      cwd: options.cwd,
      service: KEY_TO_SERVICE[options.key],
      // Explicitly use saved key only — do not accept a client-supplied token here.
    });
    if (result.status === "connected") {
      return {
        status: "connected",
        message: result.message,
        label: result.label,
        limitation: result.limitation,
        checkedAt: new Date().toISOString(),
      };
    }
    const classified = classifyVerificationFailure(result);
    return {
      status: classified,
      message: result.message,
      label: result.label,
      limitation: result.limitation,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unknown",
      message:
        error instanceof Error
          ? error.message
          : "Unable to verify saved credential.",
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function verifyAllSavedCredentialHealth(options: {
  cwd?: string;
  keys?: Array<(typeof SERVICE_KEYS)[number]>;
}): Promise<SavedCredentialHealthMap> {
  const keys = options.keys ?? [...SERVICE_KEYS];
  const entries = await Promise.all(
    keys.map(async (key) => {
      const health = await verifySavedCredentialHealth({
        cwd: options.cwd,
        key,
      });
      return [key, health] as const;
    }),
  );

  const map: SavedCredentialHealthMap = {
    LINEAR_API_KEY: { status: "missing" },
    CURSOR_API_KEY: { status: "missing" },
    GITHUB_TOKEN: { status: "missing" },
    VERCEL_TOKEN: { status: "missing" },
  };

  for (const [key, health] of entries) {
    map[key] = health;
  }
  return map;
}

export { SERVICE_KEYS as CREDENTIAL_HEALTH_KEYS };
