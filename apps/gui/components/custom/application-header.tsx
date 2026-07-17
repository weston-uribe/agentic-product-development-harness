import { SettingsMenu } from "@/components/custom/settings-menu";
import { LAYOUT } from "@/lib/constants/layout";

type ApplicationHeaderProps = {
  settingsHref?: string;
  isSettingsActive?: boolean;
  configureHref?: string;
  isConfigureActive?: boolean;
  dataSharingHref?: string;
  isDataSharingActive?: boolean;
  isWorkflowActive?: boolean;
};

export function ApplicationHeader({
  settingsHref,
  isSettingsActive,
  configureHref,
  isConfigureActive,
  dataSharingHref,
  isDataSharingActive,
  isWorkflowActive = false,
}: ApplicationHeaderProps) {
  return (
    <header className={LAYOUT.header}>
      <div className={LAYOUT.headerInner}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            P
          </span>
          <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
            PDev Harness
          </span>
        </div>
        <SettingsMenu
          settingsHref={settingsHref}
          isSettingsActive={isSettingsActive}
          configureHref={configureHref}
          isConfigureActive={isConfigureActive}
          dataSharingHref={dataSharingHref}
          isDataSharingActive={isDataSharingActive}
          isWorkflowActive={isWorkflowActive}
        />
      </div>
    </header>
  );
}
