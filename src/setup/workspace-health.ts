/**
 * Three separate health models for workspace entry, Connections, and bridge recovery.
 * Do not collapse these into a single status.
 */

/** Durable workspace maturity — used for entry routing and Settings accessibility. */
export type WorkspaceMaturity = "new" | "established";

/**
 * Vercel (and other) saved-credential health.
 * Live verification belongs in Connections after page load — not on GET /.
 */
export type CredentialHealthStatus =
  | "missing"
  | "checking"
  | "connected"
  | "unauthorized"
  | "unknown";

/** PDev automation bridge health derived from durable control-plane evidence or recovery. */
export type PDevBridgeHealthStatus =
  | "missing"
  | "deploying"
  | "unhealthy"
  | "verified";

export function credentialHealthLabel(status: CredentialHealthStatus): string {
  switch (status) {
    case "missing":
      return "Missing";
    case "checking":
      return "Checking";
    case "connected":
      return "Connected";
    case "unauthorized":
      return "Unauthorized";
    case "unknown":
      return "Unable to verify";
  }
}

export function bridgeHealthLabel(status: PDevBridgeHealthStatus): string {
  switch (status) {
    case "missing":
      return "Missing";
    case "deploying":
      return "Deploying";
    case "unhealthy":
      return "Unhealthy";
    case "verified":
      return "Verified";
  }
}
