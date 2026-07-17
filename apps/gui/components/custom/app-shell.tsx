import { ApplicationHeader } from "@/components/custom/application-header";
import { APP_MAIN_CLASS, LAYOUT } from "@/lib/constants/layout";

type AppShellProps = {
  children: React.ReactNode;
  settingsHref?: string;
  isSettingsActive?: boolean;
  configureHref?: string;
  isConfigureActive?: boolean;
  dataSharingHref?: string;
  isDataSharingActive?: boolean;
  isWorkflowActive?: boolean;
};

export function AppShell({
  children,
  settingsHref,
  isSettingsActive,
  configureHref,
  isConfigureActive,
  dataSharingHref,
  isDataSharingActive,
  isWorkflowActive,
}: AppShellProps) {
  return (
    <div className={LAYOUT.shell}>
      <ApplicationHeader
        settingsHref={settingsHref}
        isSettingsActive={isSettingsActive}
        configureHref={configureHref}
        isConfigureActive={isConfigureActive}
        dataSharingHref={dataSharingHref}
        isDataSharingActive={isDataSharingActive}
        isWorkflowActive={isWorkflowActive}
      />
      <main className={APP_MAIN_CLASS}>{children}</main>
    </div>
  );
}
