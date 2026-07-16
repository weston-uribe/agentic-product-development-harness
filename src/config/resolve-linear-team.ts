import { readControlPlaneSetupState } from "../setup/control-plane-setup-state.js";
import type { HarnessConfig } from "./types.js";
import { resolveHarnessWorkspaceRoot } from "./workspace-root.js";

export async function resolveAuthoritativeLinearTeamId(input: {
  config: HarnessConfig;
  workspaceRoot?: string;
  configPath?: string;
  baseDir?: string;
}): Promise<string | undefined> {
  const configuredTeamId = input.config.linear?.teamId?.trim();
  if (configuredTeamId) {
    return configuredTeamId;
  }

  const workspaceRoot =
    input.workspaceRoot ??
    resolveHarnessWorkspaceRoot({
      baseDir: input.baseDir,
      configPath: input.configPath,
    });
  const setupState = await readControlPlaneSetupState(workspaceRoot);
  const setupTeamId = setupState?.linear?.teamId?.trim();
  return setupTeamId || undefined;
}
