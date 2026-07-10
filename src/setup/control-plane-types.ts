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
