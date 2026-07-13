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

export type VercelBridgeRedeployVerificationStatus =
  | "triggered"
  | "building"
  | "ready"
  | "failed"
  | "timeout"
  | "no_source_deployment"
  | "verify_failed"
  | "verified";

export type VercelBridgeCandidateSecretSource =
  | "operator"
  | "reused-readable"
  | "generated"
  | "unreadable";

export interface VercelBridgeRedeployVerification {
  actionId: string;
  projectId: string;
  projectName: string;
  teamId?: string;
  webhookUrl: string;
  fingerprint: string;
  candidateSecretSource?: VercelBridgeCandidateSecretSource;
  sourceDeploymentId?: string;
  newDeploymentId?: string;
  status: VercelBridgeRedeployVerificationStatus;
  startedAt: string;
  updatedAt: string;
  deadlineAt: string;
  verifyAttempted: boolean;
  completedAt?: string;
  message?: string;
  blockedMessage?: string;
  blockedNextSteps?: string[];
  writtenEnvKeys?: string[];
  skippedEnvKeys?: string[];
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
  redeployVerification?: VercelBridgeRedeployVerification;
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
