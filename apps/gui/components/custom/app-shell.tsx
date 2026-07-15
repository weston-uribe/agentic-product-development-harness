import { ApplicationHeader } from "@/components/custom/application-header";
import { APP_MAIN_CLASS, LAYOUT } from "@/lib/constants/layout";

type AppShellProps = {
  children: React.ReactNode;
  configureHref?: string;
  isConfigureActive?: boolean;
  variant?: "default" | "operations";
};

export function AppShell({
  children,
  configureHref,
  isConfigureActive,
  variant = "default",
}: AppShellProps) {
  const isOperations = variant === "operations";
  return (
    <div className={LAYOUT.shell}>
      <ApplicationHeader
        configureHref={configureHref}
        isConfigureActive={isConfigureActive}
        headerInnerClassName={isOperations ? LAYOUT.operationsHeaderInner : undefined}
      />
      <main className={isOperations ? LAYOUT.operationsMain : APP_MAIN_CLASS}>{children}</main>
    </div>
  );
}
