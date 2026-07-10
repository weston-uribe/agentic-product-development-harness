import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveLocalFilePaths } from "./setup-state.js";
import type { ControlPlaneSetupState } from "./control-plane-types.js";

export type {
  ControlPlaneSetupState,
  ControlPlaneReadinessContext,
  LinearWorkspaceSelection,
  VercelBridgeSelection,
} from "./control-plane-types.js";

const STATE_FILE = path.join(".harness", "control-plane-setup.json");

function statePath(cwd?: string): string {
  const paths = resolveLocalFilePaths(cwd);
  return path.join(paths.cwd, STATE_FILE);
}

export async function readControlPlaneSetupState(
  cwd?: string,
): Promise<ControlPlaneSetupState | null> {
  const filePath = statePath(cwd);
  try {
    await access(filePath);
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ControlPlaneSetupState;
    if (parsed.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeControlPlaneSetupState(
  state: ControlPlaneSetupState,
  cwd?: string,
): Promise<void> {
  const paths = resolveLocalFilePaths(cwd);
  await mkdir(paths.harnessDir, { recursive: true });
  await writeFile(statePath(cwd), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function updateControlPlaneSetupState(
  patch: Partial<ControlPlaneSetupState>,
  cwd?: string,
): Promise<ControlPlaneSetupState> {
  const current = (await readControlPlaneSetupState(cwd)) ?? { version: 1 };
  const next: ControlPlaneSetupState = {
    ...current,
    ...patch,
    version: 1,
    linear: patch.linear ?? current.linear,
    vercel: patch.vercel ?? current.vercel,
  };
  await writeControlPlaneSetupState(next, cwd);
  return next;
}
