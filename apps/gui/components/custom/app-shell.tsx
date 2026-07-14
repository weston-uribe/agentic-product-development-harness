import { ApplicationHeader } from "@/components/custom/application-header";
import { APP_MAIN_CLASS, LAYOUT } from "@/lib/constants/layout";

type AppShellProps = {
  children: React.ReactNode;
  configureHref?: string;
  isConfigureActive?: boolean;
};

export function AppShell({
  children,
  configureHref,
  isConfigureActive,
}: AppShellProps) {
  return (
    <div className={LAYOUT.shell}>
      <ApplicationHeader
        configureHref={configureHref}
        isConfigureActive={isConfigureActive}
      />
      <main className={APP_MAIN_CLASS}>{children}</main>
    </div>
  );
}
