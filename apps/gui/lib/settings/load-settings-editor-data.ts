import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";
import { loadHarnessConfig } from "@harness/config/load-config";
import { configToFormInput } from "@harness/setup/config-local-editor";
import { readSettingsConfigFingerprint } from "@harness/setup/settings-config-patch";
import {
  loadLinearWorkspaceEditorState,
  loadSetupFormDefaults,
  loadSetupSummary,
  loadRunnerUpgradeStatusForGui,
  loadVercelSetupSummary,
} from "@/lib/setup-server";
import { loadDurableServiceConnectionSummaries } from "@/lib/verification-state";

export { loadDurableServiceConnectionSummaries };

export async function loadConnectionsEditorData() {
  const summary = await loadSetupSummary();
  const formDefaults = await loadSetupFormDefaults();
  return {
    presence: summary.envKeyPresence,
    envDefaults: formDefaults.env,
    serviceConnectionSummaries: loadDurableServiceConnectionSummaries(
      summary.envKeyPresence,
    ),
  };
}

export async function loadLinearEditorData() {
  return loadLinearWorkspaceEditorState();
}

export async function loadDeploymentsEditorData() {
  const [summary, runnerUpgradeStatus] = await Promise.all([
    loadVercelSetupSummary(),
    loadRunnerUpgradeStatusForGui().catch(() => ({
      status: "failed" as const,
      statusLabel: "Failed",
      blockedReason:
        "Runner upgrade status is unavailable. Connect GitHub in Settings → Connections.",
    })),
  ]);
  return { summary, runnerUpgradeStatus };
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
