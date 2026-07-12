export interface LinearWorkspaceSelection {
  teamMode: "existing" | "create";
  teamId?: string;
  teamKey: string;
  teamName: string;
  projectMode: "existing" | "create";
  projectId?: string;
  projectName: string;
  statusCoverageComplete: boolean;
  appliedFingerprint?: string;
  appliedAt?: string;
  manualComplete?: boolean;
}

export interface VercelSignedProbeEvidence {
  passed: boolean;
  statusCode?: number;
  result:
    | "accepted_ignored"
    | "auth_failed"
    | "unreachable"
    | "protection_redirect"
    | "error";
  reason?: string;
  probedAt: string;
  webhookHost?: string;
  webhookPath?: string;
}

export interface VercelBridgeSelection {
  teamId?: string;
  teamName?: string;
  projectId: string;
  projectName: string;
  productionUrl: string;
  webhookUrl: string;
  endpointReachable: boolean;
  envVarPresence: Record<string, "present" | "missing" | "unknown">;
  linearWebhookVerified: boolean;
  signedProbeVerified?: boolean;
  signedProbe?: VercelSignedProbeEvidence;
  verificationFingerprint?: string;
  deploymentRedeployRequired?: boolean;
  appliedFingerprint?: string;
  appliedAt?: string;
  manualComplete?: boolean;
}

export interface ControlPlaneSetupState {
  version: 1;
  linear?: LinearWorkspaceSelection;
  vercel?: VercelBridgeSelection;
}

export interface ControlPlaneReadinessContext {
  state: ControlPlaneSetupState | null;
  linearTeamKeyFromConfig?: string;
}
