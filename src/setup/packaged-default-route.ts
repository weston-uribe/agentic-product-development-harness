import { access, readFile } from "node:fs/promises";
import { loadConfig } from "../config/load-config.js";
import { readControlPlaneSetupState } from "./control-plane-setup-state.js";
import { resolveLocalFilePaths } from "./setup-state.js";

export const CONFIGURE_ROUTE = "/settings/configure";
export const WORKFLOW_ROUTE = "/workflow";
export const DEFAULT_PACKAGED_ROUTE = "/";

export type PackagedDefaultRouteEvidence =
  | "configured"
  | "incomplete"
  | "ambiguous";

export type PackagedDefaultRouteDecision = {
  route: typeof CONFIGURE_ROUTE | typeof WORKFLOW_ROUTE;
  evidence: PackagedDefaultRouteEvidence;
};

const REQUIRED_ENV_KEYS = [
  "LINEAR_API_KEY",
  "CURSOR_API_KEY",
  "GITHUB_TOKEN",
] as const;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function envKeysPresent(envLocalPath: string): Promise<boolean> {
  try {
    const content = await readFile(envLocalPath, "utf8");
    return REQUIRED_ENV_KEYS.every((key) => {
      const pattern = new RegExp(`^\\s*${key}\\s*=\\s*\\S+`, "m");
      return pattern.test(content);
    });
  } catch {
    return false;
  }
}

/**
 * Resolve the default GUI route from durable local evidence only.
 * Does not perform live Linear, GitHub, Vercel, or Cursor requests.
 */
export async function resolvePackagedDefaultRoute(
  cwd?: string,
): Promise<PackagedDefaultRouteDecision> {
  const paths = resolveLocalFilePaths(cwd);
  const envExists = await fileExists(paths.envLocal);
  const configExists = await fileExists(paths.configLocal);

  if (!configExists && !envExists) {
    return { route: CONFIGURE_ROUTE, evidence: "incomplete" };
  }

  if (!configExists || !envExists) {
    return { route: CONFIGURE_ROUTE, evidence: "ambiguous" };
  }

  let config;
  try {
    config = await loadConfig(paths.configLocal);
  } catch {
    return { route: CONFIGURE_ROUTE, evidence: "ambiguous" };
  }

  if (!config.repos?.length) {
    return { route: CONFIGURE_ROUTE, evidence: "incomplete" };
  }

  const envReady = await envKeysPresent(paths.envLocal);
  if (!envReady) {
    return { route: CONFIGURE_ROUTE, evidence: "ambiguous" };
  }

  const controlPlane = await readControlPlaneSetupState(paths.cwd);
  const linearConfigured = Boolean(
    controlPlane?.linear?.teamId?.trim() &&
      controlPlane.linear.teamKey?.trim(),
  );
  const workflowModelsEvidence = Boolean(
    controlPlane?.workflowModels?.configFingerprint?.trim(),
  );

  if (linearConfigured || workflowModelsEvidence) {
    return { route: WORKFLOW_ROUTE, evidence: "configured" };
  }

  return { route: CONFIGURE_ROUTE, evidence: "ambiguous" };
}
