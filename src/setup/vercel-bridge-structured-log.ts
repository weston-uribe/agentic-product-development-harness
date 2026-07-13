import type { VercelEnvWritePlanEntry } from "./vercel-setup-plan.js";

const SECRET_KEY_PATTERN =
  /LINEAR_WEBHOOK_SECRET|GITHUB_TOKEN|LINEAR_API_KEY|VERCEL_TOKEN|GITHUB_DISPATCH_TOKEN|linear-signature|signature/i;

export type VercelBridgeLogPhase =
  | "apply_start"
  | "apply_complete"
  | "redeploy_trigger"
  | "poll"
  | "poll_reconstruct"
  | "verify_claim"
  | "verify_retry"
  | "signed_probe"
  | "blocked";

export interface VercelBridgeStructuredLogEvent {
  phase: VercelBridgeLogPhase;
  actionId?: string;
  projectId?: string;
  projectName?: string;
  teamId?: string;
  fingerprint?: string;
  candidateSecretSource?: string;
  hasLocalWebhookSecret?: boolean;
  envWritePlan?: Array<Pick<VercelEnvWritePlanEntry, "key" | "action" | "source">>;
  pollStatus?: string;
  verifyAttempted?: boolean;
  verifyOnly?: boolean;
  signedProbeResult?: string;
  signedProbeReason?: string;
  signedProbeStatusCode?: number;
  setupBlockedMessage?: string;
  setupBlockedNextSteps?: string[];
  expectedFingerprint?: string;
  reconstructedFingerprint?: string;
  fingerprintMatch?: boolean;
  differingFingerprintKeys?: string[];
  message?: string;
}

function containsSecretLikeValue(value: string): boolean {
  return SECRET_KEY_PATTERN.test(value);
}

function sanitizeString(value: string): string {
  if (containsSecretLikeValue(value)) {
    return "[redacted]";
  }
  return value;
}

export function sanitizeVercelBridgeLogEvent(
  event: VercelBridgeStructuredLogEvent,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {
    event: "vercel_bridge_setup",
    ...event,
  };

  if (event.setupBlockedMessage) {
    sanitized.setupBlockedMessage = sanitizeString(event.setupBlockedMessage);
  }
  if (event.setupBlockedNextSteps) {
    sanitized.setupBlockedNextSteps = event.setupBlockedNextSteps.map((step) =>
      sanitizeString(step),
    );
  }
  if (event.message) {
    sanitized.message = sanitizeString(event.message);
  }

  return sanitized;
}

export function logVercelBridgeEvent(event: VercelBridgeStructuredLogEvent): void {
  console.log(
    `[setup:vercel-bridge] ${JSON.stringify(sanitizeVercelBridgeLogEvent(event))}`,
  );
}
