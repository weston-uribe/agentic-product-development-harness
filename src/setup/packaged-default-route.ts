import { readInitialSetupRoutingState } from "./initial-setup-lifecycle.js";

export const CONFIGURE_ROUTE = "/settings/configure";
export const WORKFLOW_ROUTE = "/workflow";
export const SETTINGS_ROUTE = "/settings";
export const DEFAULT_PACKAGED_ROUTE = "/";

export type PackagedDefaultRouteEvidence =
  | "initial-setup-complete"
  | "initial-setup-incomplete";

export type PackagedDefaultRouteDecision = {
  route: typeof CONFIGURE_ROUTE | typeof WORKFLOW_ROUTE;
  evidence: PackagedDefaultRouteEvidence;
};

/**
 * Resolve the default GUI route from durable local initialSetup status only.
 * Does not perform live Linear, GitHub, Vercel, or Cursor requests.
 */
export async function resolvePackagedDefaultRoute(
  cwd?: string,
): Promise<PackagedDefaultRouteDecision> {
  const { complete } = await readInitialSetupRoutingState(cwd);
  if (complete) {
    return { route: WORKFLOW_ROUTE, evidence: "initial-setup-complete" };
  }
  return { route: CONFIGURE_ROUTE, evidence: "initial-setup-incomplete" };
}
