import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";
import { loadHarnessConfig } from "@harness/config/load-config";
import { configToFormInput } from "@harness/setup/config-local-editor";
import { readSettingsConfigFingerprint } from "@harness/setup/settings-config-patch";
import {
  loadLinearWorkspaceEditorState,
  loadSetupFormDefaults,
  loadSetupSummary,
  loadVercelSetupSummary,
} from "@/lib/setup-server";

export async function loadConnectionsEditorData() {
  const summary = await loadSetupSummary();
  const formDefaults = await loadSetupFormDefaults();
  return {
    presence: summary.envKeyPresence,
    envDefaults: formDefaults.env,
  };
}

export async function loadLinearEditorData() {
  return loadLinearWorkspaceEditorState();
}

export async function loadDeploymentsEditorData() {
  const summary = await loadVercelSetupSummary();
  return { summary };
}

export async function loadRepositoriesEditorData() {
  const cwd = resolveHarnessWorkspaceDir();
  const [{ config }, fingerprint] = await Promise.all([
    loadHarnessConfig({ baseDir: cwd }),
    readSettingsConfigFingerprint(cwd),
  ]);
  return {
    configForm: configToFormInput(config),
    configFingerprint: fingerprint,
  };
}
