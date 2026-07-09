import "server-only";

import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";
import {
  getSetupStateSummary,
  type SetupGuiViewModel,
} from "@harness/setup/gui-view-model";

export async function loadSetupSummary(): Promise<SetupGuiViewModel> {
  return getSetupStateSummary({ cwd: resolveHarnessRepoRoot() });
}

export type { SetupGuiViewModel };
