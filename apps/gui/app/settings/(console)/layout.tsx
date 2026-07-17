import { redirect } from "next/navigation";
import { AppShell } from "@/components/custom/app-shell";
import { SettingsShell } from "@/components/settings/settings-shell";
import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";
import {
  isInitialSetupComplete,
  migrateExistingCompletedWorkspace,
} from "@harness/setup/initial-setup-lifecycle";
import {
  CONFIGURE_ROUTE,
} from "@harness/setup/packaged-default-route";
import {
  loadRemoteSetupSummary,
  loadSetupSummary,
} from "@/lib/setup-server";

export const dynamic = "force-dynamic";

export default async function SettingsConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cwd = resolveHarnessWorkspaceDir();
  const [setupSummary, remoteSummary] = await Promise.all([
    loadSetupSummary(),
    loadRemoteSetupSummary(),
  ]);

  const state = await migrateExistingCompletedWorkspace({
    cwd,
    setupSummary,
    remoteSummary,
  });

  if (!isInitialSetupComplete(state)) {
    redirect(CONFIGURE_ROUTE);
  }

  return (
    <AppShell settingsHref="/settings" isSettingsActive>
      <SettingsShell>{children}</SettingsShell>
    </AppShell>
  );
}
