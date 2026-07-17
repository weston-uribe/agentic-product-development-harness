import { ApplicationHeader } from "@/components/custom/application-header";
import { APP_MAIN_CLASS, LAYOUT } from "@/lib/constants/layout";

type AppShellProps = {
  children: React.ReactNode;
  settingsHref?: string;
  isSettingsActive?: boolean;
  isWorkflowActive?: boolean;
};

export function AppShell({
  children,
  settingsHref,
  isSettingsActive,
  isWorkflowActive,
}: AppShellProps) {
  return (
    <div className={LAYOUT.shell}>
      <ApplicationHeader
        settingsHref={settingsHref}
        isSettingsActive={isSettingsActive}
        isWorkflowActive={isWorkflowActive}
      />
      <main className={APP_MAIN_CLASS}>{children}</main>
    </div>
  );
}
