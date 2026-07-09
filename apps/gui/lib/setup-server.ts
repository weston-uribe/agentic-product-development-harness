import "server-only";

import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";
import {
  applyLocalSetupFiles,
  previewLocalSetupFiles,
  type LocalSetupApplyResult,
  type LocalSetupFormPayload,
  type LocalSetupPreviewResult,
} from "@harness/setup/local-apply-actions";
import { loadConfigFormDefaults } from "@harness/setup/config-local-editor";
import { readExistingEnvFile } from "@harness/setup/env-merge";
import { resolveLocalFilePaths } from "@harness/setup/setup-state";
import {
  getSetupStateSummary,
  type SetupGuiViewModel,
} from "@harness/setup/gui-view-model";

export async function loadSetupSummary(): Promise<SetupGuiViewModel> {
  return getSetupStateSummary({ cwd: resolveHarnessRepoRoot() });
}

export async function loadSetupFormDefaults(): Promise<{
  env: {
    harnessConfigPath: string;
    secretPresence: {
      LINEAR_API_KEY: boolean;
      CURSOR_API_KEY: boolean;
      GITHUB_TOKEN: boolean;
    };
  };
  config: Awaited<ReturnType<typeof loadConfigFormDefaults>>;
}> {
  const cwd = resolveHarnessRepoRoot();
  const paths = resolveLocalFilePaths(cwd);
  const existingEnv = await readExistingEnvFile(paths);
  const config = await loadConfigFormDefaults({ cwd });

  return {
    env: {
      harnessConfigPath:
        existingEnv?.values.HARNESS_CONFIG_PATH ?? ".harness/config.local.json",
      secretPresence: {
        LINEAR_API_KEY: existingEnv?.presence.LINEAR_API_KEY ?? false,
        CURSOR_API_KEY: existingEnv?.presence.CURSOR_API_KEY ?? false,
        GITHUB_TOKEN: existingEnv?.presence.GITHUB_TOKEN ?? false,
      },
    },
    config,
  };
}

export async function previewLocalFiles(
  payload: LocalSetupFormPayload,
): Promise<LocalSetupPreviewResult> {
  return previewLocalSetupFiles({
    cwd: resolveHarnessRepoRoot(),
    payload,
  });
}

export async function applyLocalFiles(options: {
  payload: LocalSetupFormPayload;
  confirmed: boolean;
  fingerprint: string;
}): Promise<{
  apply: LocalSetupApplyResult;
  summary: SetupGuiViewModel;
}> {
  const cwd = resolveHarnessRepoRoot();
  const apply = await applyLocalSetupFiles({
    cwd,
    payload: options.payload,
    confirmed: options.confirmed,
    fingerprint: options.fingerprint,
  });
  const summary = await getSetupStateSummary({ cwd });
  return { apply, summary };
}

export type { SetupGuiViewModel, LocalSetupFormPayload, LocalSetupPreviewResult };
